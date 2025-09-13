# FPL Chip Strategy Architect

## Overview

The FPL Chip Strategy Architect is a web application that provides personalized Fantasy Premier League (FPL) chip strategy recommendations. The tool analyzes a user's squad composition and upcoming fixture difficulty ratings to identify optimal timing for using FPL chips (Wildcard, Bench Boost, Triple Captain, and Free Hit). Built as an on-demand analysis tool, it fetches live data from the official FPL API and generates actionable insights to help managers maximize their chip effectiveness throughout the season.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management and caching
- **UI Framework**: Radix UI primitives with custom shadcn/ui components
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **Design System**: Professional productivity tool aesthetic inspired by Linear and Notion

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with Zod schema validation
- **Caching Strategy**: In-memory storage with 15-minute cache expiry for analysis results
- **Analysis Engine**: Custom algorithm that calculates squad-wide Fixture Difficulty Ratings (FDR)
- **Error Handling**: Centralized error middleware with structured JSON responses

### Data Processing Pipeline
- **FPL API Integration**: Direct integration with official Fantasy Premier League API endpoints
- **Squad Analysis**: Processes 15-player squad composition with position mapping
- **Fixture Difficulty Calculation**: Aggregates FDR scores across all players for each gameweek
- **Recommendation Engine**: Identifies optimal chip timing based on FDR patterns and thresholds
- **Response Optimization**: Lightweight JSON responses with pre-calculated recommendations

### Component Architecture
- **Atomic Design**: Reusable UI components with consistent props interface
- **Form Handling**: React Hook Form with Zod resolvers for type-safe validation
- **Data Visualization**: Custom charts for fixture difficulty timeline display
- **Responsive Design**: Mobile-first approach with progressive enhancement
- **Accessibility**: ARIA labels and keyboard navigation support

## External Dependencies

### Core Dependencies
- **FPL API**: Official Fantasy Premier League API for live player and fixture data
- **Neon Database**: PostgreSQL database with Drizzle ORM for potential data persistence
- **Google Fonts**: Inter font family for typography consistency

### Development Tools
- **TypeScript**: Type safety across frontend and backend
- **Drizzle Kit**: Database schema management and migrations
- **ESBuild**: Fast bundling for production server code
- **PostCSS**: CSS processing with Tailwind CSS compilation

### UI Libraries
- **Radix UI**: Accessible component primitives for complex interactions
- **Lucide React**: Icon library for consistent visual elements
- **Class Variance Authority**: Type-safe component variant management
- **Date-fns**: Date manipulation and formatting utilities

### Quality Assurance
- **Zod**: Runtime type validation for API requests and responses
- **TanStack Query**: Request deduplication and background refetching
- **React Error Boundaries**: Graceful error handling in UI components