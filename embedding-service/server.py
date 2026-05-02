"""
Deju Embedding Service
------------------------------
- Runs ChromaDB with local persistence
- Populates three collections from Neo4j:
    topics  : all Topic.name values
    events  : events with source_text (what people actually said)
    messages: raw message text (for future use)
- Exposes HTTP endpoints:
    GET  /health
    POST /search          { text, collection, n_results }  → similar items
    POST /index/topics    rebuild topics collection from Neo4j
    POST /index/events    rebuild events collection from Neo4j
"""

import os, sys, json, time
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

import chromadb
from chromadb.utils import embedding_functions
from neo4j import GraphDatabase

# ── Config ────────────────────────────────────────────────────────────────────
PORT        = int(os.getenv("PORT", 3004))
CHROMA_DIR  = Path(__file__).parent / "chroma_data"
NEO4J_URI   = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER  = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASS  = os.getenv("NEO4J_PASSWORD", "Dilsere@123")
NEO4J_DB    = os.getenv("NEO4J_DATABASE", "deju-expertisegraph")

# Local sentence-transformers model — fast, no API key needed
# all-MiniLM-L6-v2: 384 dims, ~80MB, very fast on CPU
EMBED_MODEL = "all-MiniLM-L6-v2"

# ── ChromaDB client (persistent) ──────────────────────────────────────────────
CHROMA_DIR.mkdir(exist_ok=True)
chroma = chromadb.PersistentClient(path=str(CHROMA_DIR))
ef     = embedding_functions.SentenceTransformerEmbeddingFunction(model_name=EMBED_MODEL)

def get_or_create(name):
    return chroma.get_or_create_collection(name=name, embedding_function=ef,
                                           metadata={"hnsw:space": "cosine"})

col_topics   = get_or_create("topics")
col_events   = get_or_create("events")
col_messages = get_or_create("messages")

# ── Neo4j helpers ──────────────────────────────────────────────────────────────
def neo4j_session():
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
    return driver

def run_query(driver, cypher, params=None):
    with driver.session(database=NEO4J_DB) as s:
        result = s.run(cypher, params or {})
        return [dict(r) for r in result]

# ── Indexing ───────────────────────────────────────────────────────────────────
def index_topics(driver):
    """Embed all Topic nodes: id=name, document=name, metadata={category}"""
    rows = run_query(driver, "MATCH (t:Topic) RETURN t.name AS name, t.category AS category")
    if not rows:
        return 0

    ids  = [r["name"] for r in rows]
    docs = [r["name"] for r in rows]
    metas = [{"category": r.get("category") or "General"} for r in rows]

    # Upsert in batches of 100
    col_topics.delete(where={"category": {"$ne": "___never___"}})  # clear first
    for i in range(0, len(ids), 100):
        col_topics.upsert(ids=ids[i:i+100], documents=docs[i:i+100], metadatas=metas[i:i+100])

    print(f"  ✅ Indexed {len(ids)} topics")
    return len(ids)

def index_events(driver):
    """Embed events that have source_text — document = source_text, metadata = {user_id, event_type, topic}"""
    rows = run_query(driver, """
        MATCH (e:Event)-[:OWNED_BY]->(u:User)
        OPTIONAL MATCH (e)-[:ABOUT]->(t:Topic)
        WHERE e.source_text IS NOT NULL
        RETURN e.event_id AS id,
               e.source_text AS text,
               e.event_type AS event_type,
               u.user_id AS user_id,
               u.name AS user_name,
               collect(t.name)[0] AS topic
    """)
    if not rows:
        return 0

    ids   = [r["id"] for r in rows]
    docs  = [r["text"] or "" for r in rows]
    metas = [{
        "user_id":    r.get("user_id") or "",
        "user_name":  r.get("user_name") or "",
        "event_type": r.get("event_type") or "",
        "topic":      r.get("topic") or "",
    } for r in rows]

    col_events.delete(where={"user_id": {"$ne": "___never___"}})
    for i in range(0, len(ids), 100):
        col_events.upsert(ids=ids[i:i+100], documents=docs[i:i+100], metadatas=metas[i:i+100])

    print(f"  ✅ Indexed {len(ids)} events")
    return len(ids)

# ── Search ─────────────────────────────────────────────────────────────────────
def search(collection_name, query_text, n_results=10):
    col = {"topics": col_topics, "events": col_events, "messages": col_messages}.get(collection_name)
    if not col:
        return {"error": f"Unknown collection: {collection_name}"}

    results = col.query(query_texts=[query_text], n_results=min(n_results, col.count() or 1))
    hits = []
    for i, doc_id in enumerate(results["ids"][0]):
        hits.append({
            "id":       doc_id,
            "document": results["documents"][0][i],
            "metadata": results["metadatas"][0][i],
            "distance": results["distances"][0][i],
            "score":    round(1 - results["distances"][0][i], 4),  # cosine: 1=identical
        })
    return {"query": query_text, "collection": collection_name, "results": hits}

# ── HTTP handler ───────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def send_json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(data))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self.send_json(200, {
                "status": "ok",
                "service": "embedding-service",
                "model": EMBED_MODEL,
                "collections": {
                    "topics":   col_topics.count(),
                    "events":   col_events.count(),
                    "messages": col_messages.count(),
                }
            })
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        body = self.read_body()

        if path == "/search":
            text       = body.get("text", "")
            collection = body.get("collection", "topics")
            n          = int(body.get("n_results", 10))
            if not text:
                return self.send_json(400, {"error": "text is required"})
            result = search(collection, text, n)
            self.send_json(200, result)

        elif path == "/index/topics":
            driver = neo4j_session()
            try:
                n = index_topics(driver)
                self.send_json(200, {"indexed": n, "collection": "topics"})
            finally:
                driver.close()

        elif path == "/index/events":
            driver = neo4j_session()
            try:
                n = index_events(driver)
                self.send_json(200, {"indexed": n, "collection": "events"})
            finally:
                driver.close()

        elif path == "/index/all":
            driver = neo4j_session()
            try:
                nt = index_topics(driver)
                ne = index_events(driver)
                self.send_json(200, {"topics": nt, "events": ne})
            finally:
                driver.close()

        else:
            self.send_json(404, {"error": "Not found"})


# ── Startup ────────────────────────────────────────────────────────────────────
def startup_index():
    """Index from Neo4j on startup if collections are empty."""
    driver = neo4j_session()
    try:
        if col_topics.count() == 0:
            print("  📦 Topics collection empty — indexing from Neo4j...")
            index_topics(driver)
        else:
            print(f"  ✅ Topics: {col_topics.count()} already indexed")

        if col_events.count() == 0:
            print("  📦 Events collection empty — indexing from Neo4j...")
            index_events(driver)
        else:
            print(f"  ✅ Events: {col_events.count()} already indexed")
    finally:
        driver.close()

if __name__ == "__main__":
    print(f"\n🚀 Starting embedding-service on port {PORT}")
    print(f"   Model:   {EMBED_MODEL}")
    print(f"   Storage: {CHROMA_DIR}")

    print("\n  Connecting to Neo4j and indexing...")
    t0 = time.time()
    startup_index()
    print(f"  ⏱  Indexing done in {time.time()-t0:.1f}s")

    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"\n✅ Embedding service ready at http://localhost:{PORT}")
    print(f"   POST /search          — vector search")
    print(f"   POST /index/all       — re-index from Neo4j")
    print(f"   GET  /health          — status\n")
    server.serve_forever()
