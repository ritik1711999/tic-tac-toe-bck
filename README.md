# 🎮 Tic-Tac-Toe Backend API

> Intelligent game server with AI-powered analysis, real-time multiplayer, and aging mechanics support

A robust Node.js backend powering the Tic-Tac-Toe AI application with **Google Gemini 1.5 Flash** integration for strategic move analysis, **Socket.IO** for real-time gameplay, and comprehensive game management features.

---

## ✨ Key Features

### 🧠 **AI-Powered Analysis**

- **Google Gemini 1.5 Flash** integration for post-game analysis
- Dual-dimensional scoring: Tactical (70%) + Longevity (30%)
- Strategic reasoning and alternative move suggestions
- Aging-aware analysis with piece lifespan tracking
- Move quality evaluation (excellent/good/suboptimal/mistake)

### ⏳ **Aging Game Mechanics**

- Dynamic piece expiration based on difficulty level
- Automatic board state updates when pieces expire
- Move lifespan calculation and tracking
- Volatility scoring for board complexity
- Expiration history and statistics

### 🎯 **Game Management**

- Full CRUD operations for games
- Move validation and board state management
- Support for AI and multiplayer modes
- Game history with filtering and pagination
- Statistics aggregation and analytics

### 🔐 **Authentication & Authorization**

- JWT-based authentication
- Secure password hashing with bcrypt
- User profile management
- Protected route middleware
- Session persistence

### ⚡ **Real-time Multiplayer**

- Socket.IO for bidirectional communication
- Room-based game isolation
- Live move broadcasting
- Connection status monitoring
- Game state synchronization

### 📊 **Analytics & Dashboard**

- User statistics (wins, losses, draws)
- Game history tracking
- Achievement system
- Performance metrics
- Recent games retrieval

---

## 🚀 Tech Stack

### **Core Technologies**

- **Node.js** >= 18.0.0 - JavaScript runtime
- **Express** 4.x - Web framework
- **TypeScript** 5.x - Type-safe development
- **MongoDB** >= 6.0 - NoSQL database
- **Mongoose** 8.x - ODM for MongoDB

### **AI & Analysis**

- **@google/generative-ai** - Gemini AI SDK
- **Google Gemini 1.5 Flash** - Move analysis engine
- Custom prompting for aging game mechanics

### **Real-time Communication**

- **Socket.IO** 4.x - WebSocket server
- Room management for game isolation
- Event-based architecture

### **Authentication & Security**

- **jsonwebtoken** - JWT token generation/validation
- **bcryptjs** - Password hashing
- **express-validator** - Input validation
- **helmet** - Security headers
- **cors** - Cross-origin resource sharing

### **Development Tools**

- **ts-node-dev** - Hot reload in development
- **ESLint** - Code quality
- **Docker** - Containerization support

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           Express Application               │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐      ┌─────────────┐     │
│  │   Routes    │─────►│ Controllers │     │
│  │  /api/...   │      │   Logic     │     │
│  └─────────────┘      └──────┬──────┘     │
│                               │             │
│  ┌─────────────┐      ┌──────▼──────┐     │
│  │ Middleware  │      │  Services   │     │
│  │  Auth/CORS  │      │  Business   │     │
│  └─────────────┘      └──────┬──────┘     │
│                               │             │
│                        ┌──────▼──────┐     │
│                        │   Models    │     │
│                        │  Mongoose   │     │
│                        └──────┬──────┘     │
└───────────────────────────────┼─────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
            ┌───────▼─────┐         ┌──────▼──────┐
            │   MongoDB   │         │ Gemini API  │
            │  Database   │         │  Analysis   │
            └─────────────┘         └─────────────┘
```

### **Design Patterns**

- **MVC Architecture**: Separation of routes, controllers, and models
- **Service Layer**: Business logic isolation
- **Middleware Pipeline**: Request processing and validation
- **Repository Pattern**: Data access abstraction via Mongoose
- **Event-Driven**: Socket.IO for real-time features

---

## 📦 Getting Started

### **Prerequisites**

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **MongoDB** >= 6.0 (local or cloud instance)
- **Google Gemini API Key** ([Get it here](https://makersuite.google.com/app/apikey))

### **Installation**

#### 1. Clone the Repository

```bash
git clone <repository-url>
cd tic-tac-toe-bck
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
MONGODB_URI=mongodb://localhost:27017/tictactoe

# Authentication
JWT_SECRET=your_very_secure_jwt_secret_key_min_32_chars
JWT_EXPIRES_IN=7d

# AI Integration
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: OAuth (if implementing Google login)
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

#### 4. Start MongoDB

If running MongoDB locally:

```bash
# macOS/Linux
mongod

# Windows
"C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe"

# Or use Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

#### 5. Start the Server

**Development mode (with hot reload):**

```bash
npm run dev
```

**Production mode:**

```bash
npm run build
npm start
```

The server will run on `http://localhost:3000`

### **Docker Deployment**

Build and run using Docker:

```bash
# Build image
docker build -t tictactoe-backend .

# Run container
docker run -p 3000:3000 --env-file .env tictactoe-backend

# Or use docker-compose
docker-compose up
```

---

## 📁 Project Structure

```
src/
├── config/                   # Configuration files
│   └── database.ts          # MongoDB connection setup
│
├── controllers/              # Request handlers
│   ├── authController.ts    # User registration, login, profile
│   ├── gameController.ts    # Game CRUD, moves, analysis
│   ├── aiController.ts      # AI move suggestions
│   └── dashboardController.ts # User statistics & history
│
├── middleware/               # Express middleware
│   └── authMiddleware.ts    # JWT verification & route protection
│
├── models/                   # Mongoose schemas
│   ├── User.ts              # User model with authentication
│   ├── Game.ts              # Game state and metadata
│   ├── Move.ts              # Individual moves with aging data
│   ├── Achievement.ts       # User achievements
│   └── index.ts             # Model exports
│
├── routes/                   # API route definitions
│   ├── auth.ts              # POST /api/auth/register, /login
│   ├── games.ts             # /api/games/* endpoints
│   ├── ai.ts                # /api/ai/* endpoints
│   └── dashboard.ts         # /api/dashboard/* endpoints
│
├── services/                 # Business logic layer
│   ├── geminiService.ts     # Gemini AI integration & prompting
│   ├── gameEngine.ts        # Game logic & win detection
│   ├── aiService.ts         # Minimax algorithm for AI moves
│   └── socketService.ts     # Socket.IO event handlers
│
├── types/                    # TypeScript type definitions
│   └── express.d.ts         # Extended Express types
│
└── tests/                    # Test files (unit & integration)

app.ts                        # Express app initialization
```

---

## 🔌 API Documentation

### **Base URL**

```
http://localhost:3000/api
```

### **Authentication Endpoints**

#### `POST /api/auth/register`

Register a new user account.

**Request Body:**

```json
{
  "username": "player1",
  "email": "player@example.com",
  "password": "securePassword123"
}
```

**Response (201):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "player1",
    "email": "player@example.com"
  }
}
```

---

#### `POST /api/auth/login`

Authenticate user and receive JWT token.

**Request Body:**

```json
{
  "email": "player@example.com",
  "password": "securePassword123"
}
```

**Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "player1",
    "email": "player@example.com",
    "stats": {
      "gamesPlayed": 10,
      "wins": 6,
      "losses": 2,
      "draws": 2
    }
  }
}
```

---

#### `GET /api/auth/me`

Get current authenticated user's profile.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "username": "player1",
  "email": "player@example.com",
  "stats": { ... },
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

### **Game Endpoints**

#### `POST /api/games`

Create a new game.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "vs": "AI", // "AI" or "Human"
  "difficulty": "medium", // "easy", "medium", or "hard"
  "agingEnabled": true, // Enable aging mechanic
  "maxAge": 5 // Optional: override default maxAge
}
```

**Response (201):**

```json
{
  "_id": "game123",
  "userId": "507f1f77bcf86cd799439011",
  "vs": "AI",
  "difficulty": "medium",
  "agingEnabled": true,
  "maxAge": 5,
  "status": "in-progress",
  "board": ["", "", "", "", "", "", "", "", ""],
  "currentPlayer": "X",
  "createdAt": "2026-01-15T10:00:00.000Z"
}
```

---

#### `GET /api/games/:gameId`

Retrieve game details with all moves and current board state.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "game": {
    "_id": "game123",
    "vs": "AI",
    "status": "completed",
    "outcome": "win",
    "board": ["X", "O", "X", "O", "X", "", "O", "", ""],
    ...
  },
  "moves": [
    {
      "_id": "move1",
      "gameId": "game123",
      "moveNumber": 1,
      "position": 0,
      "player": "X",
      "isAiMove": false,
      "expiresOnMove": 6,
      "timestamp": "2026-01-15T10:00:05.000Z"
    },
    ...
  ],
  "board": ["X", "O", "X", "O", "X", "", "O", "", ""],
  "currentPlayer": "O"
}
```

---

#### `POST /api/games/:gameId/moves`

Submit a move in an active game.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "position": 4, // Board position (0-8)
  "player": "X" // "X" or "O"
}
```

**Response (200):**

```json
{
  "success": true,
  "move": {
    "_id": "move5",
    "moveNumber": 5,
    "position": 4,
    "player": "X",
    "expiresOnMove": 10,
    ...
  },
  "game": {
    "board": ["X", "O", "X", "O", "X", "", "O", "", ""],
    "currentPlayer": "O",
    "status": "in-progress"
  }
}
```

---

#### `GET /api/games/:gameId/analysis`

Get AI-powered post-game analysis using Google Gemini.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "id": "game123",
  "title": "Game vs AI - Medium",
  "date": "2026-01-15T10:00:00.000Z",
  "duration": "00:03:24",
  "result": "win",
  "moves": [
    {
      "moveNumber": 1,
      "position": "Top-Left",
      "player": "X",
      "quality": "excellent",
      "score": 92,
      "tacticalScore": 95,
      "longevityScore": 85,
      "lifespan": 5,
      "expiresOnMove": 6,
      "aiRecommendation": "Strong opening move controlling the corner...",
      "reasoning": "Corner positions offer maximum strategic flexibility...",
      "alternativeMove": null,
      "outcomes": { "win": 45, "draw": 30, "lose": 25 }
    },
    ...
  ],
  "performanceMetrics": {
    "overallScore": 78,
    "breakdown": {
      "excellent": 3,
      "good": 4,
      "suboptimal": 2,
      "mistakes": 0
    },
    "keyMoments": [
      {
        "moveNumber": 5,
        "description": "Decisive winning move by controlling center"
      }
    ]
  },
  "agingMetrics": {
    "maxAge": 5,
    "totalMoves": 9,
    "totalExpirations": 2,
    "avgLifespan": 4.2,
    "volatilityScore": 62
  }
}
```

---

#### `GET /api/games`

Get user's game history with filtering and pagination.

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**

- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `status` (string): Filter by status ("completed", "in-progress", "abandoned")
- `vs` (string): Filter by opponent type ("AI", "Human")
- `outcome` (string): Filter by result ("win", "lose", "draw")

**Response (200):**

```json
{
  "games": [ ... ],
  "total": 45,
  "page": 1,
  "pages": 5
}
```

---

### **AI Endpoints**

#### `POST /api/ai/suggestions`

Get AI move suggestions for current board state.

**Request Body:**

```json
{
  "board": ["X", "O", "X", "", "", "", "O", "", ""],
  "player": "X",
  "difficulty": "medium"
}
```

**Response (200):**

```json
{
  "suggestions": [
    { "position": 4, "score": 85, "reasoning": "Controls center..." },
    { "position": 8, "score": 72, "reasoning": "Corner defense..." }
  ],
  "bestMove": 4
}
```

---

### **Dashboard Endpoints**

#### `GET /api/dashboard/stats`

Get user's overall statistics.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "gamesPlayed": 50,
  "wins": 28,
  "losses": 15,
  "draws": 7,
  "winRate": 56,
  "avgGameDuration": "00:04:15",
  "favoriteMode": "AI - Medium",
  "currentStreak": 3,
  "longestStreak": 7
}
```

---

#### `GET /api/dashboard/achievements`

Get user's unlocked achievements.

**Response (200):**

```json
{
  "achievements": [
    {
      "_id": "achievement1",
      "title": "First Victory",
      "description": "Win your first game",
      "icon": "trophy",
      "unlockedAt": "2026-01-10T15:30:00.000Z"
    },
    ...
  ],
  "total": 12,
  "unlocked": 8
}
```

---

## 🔌 Socket.IO Events

### **Client → Server**

#### `game:join`

Join a game room for real-time updates.

**Payload:**

```json
{
  "gameId": "game123",
  "userId": "507f1f77bcf86cd799439011"
}
```

---

#### `game:move`

Broadcast a move to other players.

**Payload:**

```json
{
  "gameId": "game123",
  "position": 4,
  "player": "X"
}
```

---

### **Server → Client**

#### `game:update`

Receive updated game state.

**Payload:**

```json
{
  "board": ["X", "O", "X", "O", "X", "", "O", "", ""],
  "currentPlayer": "O",
  "lastMove": {
    "position": 4,
    "player": "X",
    "moveNumber": 5
  }
}
```

---

#### `game:end`

Notification when game completes.

**Payload:**

```json
{
  "gameId": "game123",
  "winner": "X",
  "outcome": "win",
  "winningLine": [0, 4, 8]
}
```

---

#### `connection:status`

Connection state updates.

**Payload:**

```json
{
  "status": "connected",
  "userId": "507f1f77bcf86cd799439011"
}
```

---

## 🧠 Gemini AI Integration

### **Analysis Workflow**

1. **Data Preparation**: Gather game metadata, moves, and board states
2. **Aging Context**: Calculate lifespan, expirations, volatility
3. **Prompt Construction**: Build structured prompt with context
4. **AI Processing**: Send to Gemini 1.5 Flash
5. **Response Parsing**: Normalize scores and format data
6. **Database Storage**: Cache analysis results

### **Prompt Structure**

```typescript
const prompt = `
Analyze this tic-tac-toe game with aging mechanics:

Game Context:
- Difficulty: ${difficulty}
- Max Age: ${maxAge} moves
- Total Moves: ${moves.length}
- Result: ${outcome}

Aging Mechanics:
- Pieces expire after ${maxAge} moves
- ${totalExpirations} pieces expired during game
- Average lifespan: ${avgLifespan} moves

Board States:
${boardStatesJson}

Provide analysis for each move with:
1. Tactical score (0-100): Pure strategic value
2. Longevity score (0-100): Survival probability
3. Blended score: 0.7 × tactical + 0.3 × longevity
4. Quality: excellent/good/suboptimal/mistake
5. Reasoning and alternative suggestions
`;
```

---

## 🛡️ Security

### **Authentication**

- JWT tokens with configurable expiration
- Secure password hashing (bcrypt with salt rounds)
- Protected routes via middleware

### **Input Validation**

- Express-validator for request validation
- Mongoose schema validation
- Sanitization of user inputs

### **Security Headers**

- Helmet.js for HTTP headers
- CORS configuration for allowed origins
- Rate limiting (optional, recommended for production)

### **Environment Variables**

- Sensitive data in `.env` file
- Never commit `.env` to version control
- Use strong JWT secrets (min 32 characters)

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Watch mode
npm run test:watch
```

---

## 🔧 Development

### **Code Quality**

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type checking
npm run type-check
```

### **Database Management**

```bash
# Seed database with sample data
npm run seed

# Clear database
npm run db:clear

# Run migrations (if any)
npm run migrate
```

### **Debugging**

Enable debug logging by setting environment variable:

```bash
DEBUG=app:* npm run dev
```

---

## 📊 Performance Considerations

### **Database Optimization**

- Indexes on frequently queried fields (userId, gameId, status)
- Pagination for large datasets
- Lean queries for read-only operations
- Connection pooling for MongoDB

### **Caching Strategy**

- Consider Redis for session storage (production)
- Cache frequently accessed game states
- TTL for analysis results

### **Scaling**

- Horizontal scaling with load balancer
- Stateless server design (JWT tokens)
- Socket.IO with Redis adapter for multi-instance support

---

## 🚀 Deployment

### **Environment Setup**

Production environment variables:

```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/tictactoe
JWT_SECRET=<strong-production-secret>
GEMINI_API_KEY=<production-api-key>
FRONTEND_URL=https://your-frontend-domain.com
```

### **Deployment Platforms**

**Heroku:**

```bash
heroku create tictactoe-api
heroku addons:create mongolab
heroku config:set JWT_SECRET=<secret> GEMINI_API_KEY=<key>
git push heroku main
```

**Render/Railway:**

- Connect GitHub repository
- Set environment variables
- Auto-deploy on push

**AWS/DigitalOcean:**

- Use PM2 for process management
- Nginx as reverse proxy
- SSL certificate with Let's Encrypt

### **Docker Production**

```bash
docker build -t tictactoe-backend:prod .
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e MONGODB_URI=<uri> \
  -e JWT_SECRET=<secret> \
  tictactoe-backend:prod
```

---

## 🔮 Future Enhancements

- [ ] **Rate Limiting**: Implement Redis-based rate limiting
- [ ] **Caching Layer**: Redis cache for game states and analysis
- [ ] **WebRTC Integration**: Peer-to-peer video chat during games
- [ ] **Tournament System**: Multi-player tournament brackets
- [ ] **ELO Rating**: Competitive ranking system
- [ ] **Replay System**: Store and replay complete games
- [ ] **Admin Dashboard**: Game moderation and analytics
- [ ] **Webhook Support**: External integrations
- [ ] **GraphQL API**: Alternative to REST endpoints
- [ ] **Microservices**: Split AI service into separate container
- [ ] **Message Queue**: RabbitMQ/Kafka for async processing
- [ ] **Comprehensive Testing**: Unit, integration, and E2E tests

---

**Built with ❤️ using Node.js, Express, MongoDB, and Google Gemini AI**
