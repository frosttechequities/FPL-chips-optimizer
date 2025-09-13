# Infinitely Powerful FPL Chip Strategy Architect

AI-powered FPL strategy optimization combining bookmaker odds, advanced statistics, Monte Carlo simulations, machine learning predictions, competitive intelligence, and natural language processing. Features an intelligent AI co-pilot that understands FPL terminology and provides conversational strategic guidance.

## Quickstart

- Prerequisites: Node.js 20+
- Install: `npm install`
- Dev (API + Client on the same port): `npm run dev`
- Type-check: `npm run check`
- Build (client + bundled server): `npm run build`
- Start production server: `npm start`

Default port is `5000` (configurable via `PORT`).

## Environment

- `PORT` (optional): HTTP port. Defaults to `5000`.
- `DATABASE_URL` (optional): Only required if using Drizzle Kit migrations (not required for runtime).
- `OPENROUTER_API_KEY` (optional): Required for enhanced LLM responses via OpenRouter's Qwen3 Coder model. System gracefully falls back to static responses if not configured.

## API Reference

Base URL is the same as the client (the Express server serves both).

- GET `/api/health`
  - Returns `{ status: "ok", timestamp }`.

- POST `/api/analyze`
  - Body: `{ teamId: string }` (numeric string)
  - Response: `AnalyzeTeamResponse` with:
    - `players`: processed 15-man squad
    - `gameweeks`: squad FDR timeline (next ~10 GWs)
    - `recommendations`: chip suggestions (wildcard, bench-boost, triple-captain, free-hit)
    - `budget`: bank, team value, free transfers, affordable upgrades
  - Example:
    ```bash
    curl -s http://localhost:5000/api/analyze \
      -H 'content-type: application/json' \
      -d '{"teamId":"1234567"}'
    ```

- POST `/api/transfer-plan`
  - Body: `{ teamId: string, chipType?: 'wildcard'|'bench-boost'|'triple-captain'|'free-hit', targetGameweek?: number, maxHits?: number, includeRiskyMoves?: boolean }`
  - Response: `PlanTransfersResponse` with up to 3 plans (conservative, aggressive, chip-optimized)
  - Example:
    ```bash
    curl -s http://localhost:5000/api/transfer-plan \
      -H 'content-type: application/json' \
      -d '{"teamId":"1234567", "chipType":"triple-captain", "maxHits":1}'
    ```

- POST `/api/cache/clear`
  - Clears in-memory FPL API cache. Useful during development.

- POST `/api/chat`
  - Body: `{ message: string, sessionId?: string, teamId?: string, userId?: string }`
  - Response: `AICopilotResponse` with:
    - `message`: AI-generated response to user query
    - `insights`: structured AI insights and recommendations
    - `suggestions`: actionable suggestions
    - `followUpQuestions`: contextual follow-up questions
    - `conversationContext`: query intent, response time, model version
    - `sessionId`: conversation session identifier
  - Example:
    ```bash
    curl -s http://localhost:5000/api/chat \
      -H 'content-type: application/json' \
      -d '{"message":"When should I use my wildcard?", "teamId":"1234567"}'
    ```

## Caching

- FPL API responses: 5 minutes (in-memory, per-URL key).
- Analysis results: 15 minutes per team (`/api/analyze` checks and returns cached result if still fresh).
- AI conversation sessions: 30 minutes in-memory with automatic cleanup.
- ML predictions and competitive intelligence: Various cache durations based on data freshness requirements.

## Repository Layout

- `server/`
  - `index.ts`: Express setup, Vite dev middleware/static serving, error handling.
  - `routes.ts`: REST endpoints (health, analyze, transfer-plan, cache/clear, chat).
  - `services/fplApi.ts`: Official FPL API wrapper with caching and helpers.
  - `services/analysisEngine.ts`: Enhanced with Phase 1 simulations, Phase 2 ML, and Phase 3 AI integration.
  - `services/transferEngine.ts`: Generates transfer plans (conservative, aggressive, chip-optimized).
  - `services/oddsService.ts`: Phase 1 - Bookmaker odds integration for realistic predictions.
  - `services/statsService.ts`: Phase 1 - Advanced player statistics and performance metrics.
  - `services/mlPredictionEngine.ts`: Phase 2 - Machine learning models for player predictions.
  - `services/competitiveIntelligenceEngine.ts`: Phase 2 - Rival analysis and strategic insights.
  - `services/naturalLanguageProcessor.ts`: Phase 3 - NLP for FPL query understanding.
  - `services/aiCopilotService.ts`: Phase 3 - Conversational AI with FPL domain expertise.
  - `services/openRouterService.ts`: Phase 3+ - LLM integration using OpenRouter's Qwen3 Coder model.
  - `storage.ts`: In-memory caches for analysis and FPL objects.
  - `vite.ts`: Dev HMR and production file serving.
- `client/`
  - React app with tabbed interface: Analysis & Recommendations, AI Co-pilot, Transfer Planner.
  - `components/ChatInterface.tsx`: Phase 3 - Conversational AI chat interface.
  - `components/AIInsights.tsx`: Phase 3 - AI-generated insights and recommendations display.
  - `components/SimulationSummary.tsx`: Phase 1 - Monte Carlo simulation results.
  - Tailwind theming via CSS variables; shadcn-style UI primitives.
- `shared/`
  - TypeScript models and Zod schemas for requests/responses and FPL data.
  - Enhanced schemas for AI conversations, ML predictions, and simulation data.

## Frontend UX

1. Enter your Team ID on the home page.
2. The app calls `/api/analyze` and displays results in a tabbed interface:

**Analysis & Recommendations Tab:**
   - Enhanced simulation summary with Monte Carlo confidence intervals
   - Squad overview with ML-enhanced expected points
   - Fixture Difficulty chart with volatility indicators
   - AI-powered chip recommendation cards with success probabilities

**AI Co-pilot Tab:**
   - Conversational chat interface with FPL terminology understanding
   - LLM-powered intelligent responses via OpenRouter's Qwen3 Coder model
   - Context-aware responses based on your squad and analysis
   - Structured AI insights with reasoning and action items
   - Follow-up questions to guide strategic discussions
   - Session persistence for continuous conversations
   - Graceful fallback to static responses when LLM unavailable

**Transfer Planner Tab:**
   - Budget analysis and transfer planning tools
   - Multiple plan options (conservative, aggressive, chip-optimized)
   - Integration with competitive intelligence insights

## Development Notes

- TypeScript strict mode across client/server. Aliases `@` and `@shared` are configured in Vite/tsconfig.
- Logging: concise API logs for `/api/*` with response status + timing.
- No database required at runtime. `drizzle.config.ts` only matters if you add persistence later.
- Hybrid intelligence architecture combining statistical simulations, ML predictions, and conversational AI.
- Provider pattern for data services with mock/real implementations for development flexibility.
- In-memory session management for AI conversations with automatic cleanup.
- LLM integration with OpenRouter using Qwen3 Coder model for enhanced conversational responses.
- Graceful fallback system ensuring functionality even when LLM services are unavailable.

## Implementation Status

### Phase 1: Enhanced Probabilistic Analysis ✅ COMPLETED
- ✅ Bookmaker odds integration for realistic player predictions
- ✅ Advanced statistics (xG, xA, form, volatility) from multiple providers
- ✅ Monte Carlo simulations with confidence intervals and success probabilities
- ✅ Enhanced chip recommendations with simulation-backed confidence scores
- ✅ Fixture difficulty analysis with volatility indicators

### Phase 2: Machine Learning & Competitive Intelligence ✅ COMPLETED  
- ✅ ML prediction engine with player performance forecasting
- ✅ Competitive intelligence engine for rival analysis and market insights
- ✅ Historical data analysis and pattern recognition
- ✅ Strategic recommendations combining statistical and ML approaches
- ✅ Enhanced expected points calculations with multiple data sources

### Phase 3: AI Co-pilot & Natural Language Processing ✅ COMPLETED
- ✅ Natural language processor with FPL terminology understanding
- ✅ Conversational AI co-pilot with domain expertise
- ✅ Intent recognition and entity extraction for FPL queries
- ✅ Context-aware conversation management with session persistence
- ✅ Structured AI insights with reasoning and actionable recommendations
- ✅ Chat interface with message history and follow-up suggestions

### Phase 3+: LLM Integration & Enhanced Intelligence ✅ COMPLETED
- ✅ OpenRouter integration with Qwen3 Coder model for intelligent responses
- ✅ Hybrid response system: LLM-enhanced with graceful fallback to static responses
- ✅ Rich context assembly: passes squad data, analysis results, and conversation history to LLM
- ✅ Dynamic suggestion and follow-up question generation based on user intent
- ✅ Robust error handling and credit/quota management for LLM services
- ✅ Enhanced conversational capabilities with deep FPL domain understanding

## Next Development Priorities

### Phase 4: Advanced Optimization & Personalization
- **Personalized Strategy Profiles**: Learn user preferences and risk tolerance
- **Advanced Transfer Optimization**: Multi-gameweek transfer planning with chip coordination
- **Real-time Market Intelligence**: Player price change predictions and ownership trends
- **Custom Metrics Dashboard**: User-defined KPIs and performance tracking

### Phase 5: Community & Social Features
- **League Analysis**: Head-to-head comparison and competitive positioning
- **Social Insights**: Community trends and popular strategies
- **Performance Analytics**: Historical performance tracking and improvement suggestions
- **Strategy Sharing**: Export and share analysis reports

### Technical Improvements
- **Free Hit Optimization**: Implement single-gameweek team optimization algorithms
- **Enhanced ML Models**: Incorporate weather, referee, and venue data
- **Performance Optimization**: Caching strategies and response time improvements
- **Mobile Responsiveness**: Enhanced mobile experience and PWA features

### Quality & Reliability
- **Comprehensive Testing**: Unit, integration, and E2E test coverage
- **Error Handling**: Robust error recovery and user feedback
- **Documentation**: API documentation and user guides
- **Monitoring**: Performance metrics and usage analytics

If you’re running on Replit, this repo is configured to serve both API and client on the same port for a smooth DX.
