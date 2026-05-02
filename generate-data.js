const { v4: uuidv4 } = require('uuid');

const topics = [
  'JavaScript', 'Python', 'React', 'Node.js', 'TypeScript', 'Database', 
  'API Design', 'DevOps', 'Cloud Architecture', 'Machine Learning',
  'UI/UX Design', 'System Design', 'Testing', 'Security', 'Performance',
  'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'REST APIs'
];

const userIds = ['user_A', 'user_B', 'user_C', 'user_D', 'user_E', 'user_F', 'user_G', 'user_H'];

const messageTemplates = {
  'JavaScript': [
    "Can you help me understand closures in JavaScript?",
    "What's the difference between var, let, and const?",
    "I'm having trouble with async/await. Can you explain?",
    "How do I optimize React component rendering?",
    "What's the best way to handle state management?",
    "I need to implement a debounce function",
    "How does the event loop work in Node.js?",
    "Can you review my JavaScript code for performance?",
    "What's the prototype chain in JavaScript?",
    "How do I properly handle errors in async functions?"
  ],
  'Python': [
    "How do I use list comprehensions in Python?",
    "What's the difference between Python lists and tuples?",
    "Can you help me with Django models?",
    "How do I implement a decorator in Python?",
    "What's the best way to handle exceptions in Python?",
    "I need to optimize my Pandas DataFrame operations",
    "How do virtual environments work in Python?",
    "Can you explain Python's garbage collection?",
    "What's the difference between __init__ and __new__?",
    "How do I use generators and iterators?"
  ],
  'React': [
    "How do I use React hooks properly?",
    "What's the best state management solution for React?",
    "Can you help me optimize React performance?",
    "How do I implement authentication in React?",
    "What's the difference between class and functional components?",
    "How do I handle forms in React?",
    "Can you explain React's reconciliation algorithm?",
    "What's the best way to handle routing in React?",
    "How do I implement lazy loading in React?",
    "What's the purpose of useMemo and useCallback?"
  ],
  'Node.js': [
    "How do I handle streams in Node.js?",
    "What's the best way to structure a Node.js application?",
    "Can you help me with Express middleware?",
    "How do I implement WebSocket in Node.js?",
    "What's the difference between process and thread?",
    "How do I handle file uploads in Node.js?",
    "Can you explain the module system in Node.js?",
    "What's the best way to handle database connections?",
    "How do I implement caching in Node.js?",
    "What's the event emitter pattern?"
  ],
  'Database': [
    "How do I optimize SQL queries for performance?",
    "What's the difference between SQL and NoSQL?",
    "Can you help me design a database schema?",
    "How do I implement transactions in PostgreSQL?",
    "What's the best indexing strategy for large tables?",
    "How do I handle migrations in a production database?",
    "Can you explain database normalization?",
    "What's the difference between INNER and OUTER JOIN?",
    "How do I implement pagination efficiently?",
    "What's the best way to handle concurrent writes?"
  ],
  'API Design': [
    "How do I design a RESTful API?",
    "What's the best practice for API versioning?",
    "Can you help me with authentication tokens?",
    "How do I implement rate limiting?",
    "What's the difference between PUT and PATCH?",
    "How do I handle pagination in APIs?",
    "Can you explain HATEOAS?",
    "What's the best way to document APIs?",
    "How do I implement API网关?",
    "What's the difference between RPC and REST?"
  ],
  'DevOps': [
    "How do I set up CI/CD pipelines?",
    "What's the best way to manage configuration?",
    "Can you help me with infrastructure as code?",
    "How do I implement monitoring and alerting?",
    "What's the difference between Docker and Kubernetes?",
    "How do I handle secrets in deployments?",
    "Can you explain the CI/CD workflow?",
    "What's the best way to do blue-green deployments?",
    "How do I set up logging aggregation?",
    "What's the best practice for container orchestration?"
  ],
  'Cloud Architecture': [
    "How do I design a scalable architecture?",
    "What's the best AWS service for my use case?",
    "Can you help me with cloud cost optimization?",
    "How do I implement microservices?",
    "What's the difference between IaaS, PaaS, and SaaS?",
    "How do I set up auto-scaling?",
    "Can you explain serverless architecture?",
    "What's the best way to handle disaster recovery?",
    "How do I implement multi-region architecture?",
    "What's the best practice for load balancing?"
  ],
  'Machine Learning': [
    "How do I choose the right ML algorithm?",
    "What's the best way to preprocess data?",
    "Can you help me with model evaluation?",
    "How do I implement neural networks?",
    "What's the difference between supervised and unsupervised learning?",
    "How do I handle overfitting?",
    "Can you explain gradient descent?",
    "What's the best way to tune hyperparameters?",
    "How do I deploy ML models?",
    "What's the best approach for feature engineering?"
  ],
  'UI/UX Design': [
    "How do I create accessible designs?",
    "What's the best design system for web apps?",
    "Can you help me with responsive layouts?",
    "How do I improve user engagement?",
    "What's the difference between UI and UX?",
    "How do I conduct user research?",
    "Can you explain design thinking?",
    "What's the best way to create prototypes?",
    "How do I measure design success?",
    "What's the best practice for color theory?"
  ]
};

const generateMessages = (count = 1000) => {
  const conversations = [];
  const messages = [];
  
  const conversationIds = [];
  for (let i = 0; i < 50; i++) {
    conversationIds.push(uuidv4());
  }
  
  const topicForConversation = {};
  conversationIds.forEach(convId => {
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    topicForConversation[convId] = randomTopic;
  });
  
  let messageCount = 0;
  const startDate = new Date('2024-01-01T00:00:00Z');
  
  while (messageCount < count) {
    const conversationId = conversationIds[Math.floor(Math.random() * conversationIds.length)];
    const topic = topicForConversation[conversationId];
    const templates = messageTemplates[topic] || messageTemplates['JavaScript'];
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    const senderId = userIds[Math.floor(Math.random() * userIds.length)];
    const timestamp = new Date(startDate.getTime() + Math.random() * (Date.now() - startDate.getTime()));
    
    messages.push({
      message_id: uuidv4(),
      conversation_id: conversationId,
      sender_id: senderId,
      text: template,
      timestamp: timestamp.toISOString()
    });
    
    messageCount++;
  }
  
  const uniqueConversations = [...new Set(messages.map(m => m.conversation_id))];
  const conversationData = uniqueConversations.map(convId => {
    const convMessages = messages.filter(m => m.conversation_id === convId);
    const allParticipants = [...new Set(convMessages.map(m => m.sender_id))];
    const numParticipants = Math.min(allParticipants.length, 2 + Math.floor(Math.random() * 2));
    const shuffled = allParticipants.sort(() => Math.random() - 0.5);
    
    return {
      conversation_id: convId,
      name: `${topicForConversation[convId]} Discussion`,
      is_group: numParticipants > 2,
      participants: shuffled.slice(0, numParticipants),
      message_count: convMessages.length
    };
  });
  
  return { conversations: conversationData, messages };
};

const data = generateMessages(1000);

console.log(JSON.stringify(data, null, 2));