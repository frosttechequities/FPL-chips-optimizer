# FPL Chip Strategy Architect - Design Guidelines

## Design Approach: Reference-Based (Productivity Tools)
Inspired by modern data analysis platforms like Linear, Notion, and fantasy sports tools. Clean, professional interface that prioritizes data clarity and actionable insights.

## Core Design Elements

### Color Palette
**Primary Colors:**
- Dark: 220 15% 12% (deep navy background)
- Light: 220 15% 98% (off-white background)

**Accent Colors:**
- Success Green: 142 76% 36% (for positive recommendations)
- Warning Orange: 25 95% 53% (for caution/moderate difficulty)
- Danger Red: 0 84% 60% (for high difficulty periods)
- FPL Purple: 280 100% 70% (brand accent for key CTAs)

**Text Colors:**
- Primary: 220 9% 46% (medium gray for body text)
- Secondary: 220 9% 65% (lighter gray for supporting text)
- Headers: 220 15% 20% (dark for strong hierarchy)

### Typography
- **Primary Font:** Inter (via Google Fonts)
- **Headers:** 600-700 weight, clean hierarchy (text-2xl to text-5xl)
- **Body:** 400 weight, excellent readability (text-sm to text-lg)
- **Data/Numbers:** 500 weight for emphasis on key metrics

### Layout System
**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16
- Tight spacing: p-2, m-2 (8px)
- Standard spacing: p-4, m-4 (16px) 
- Section spacing: p-8, m-8 (32px)
- Large spacing: p-12, m-12 (48px)

### Component Library

**Navigation:**
- Clean top navigation with FPL branding
- Minimal navigation items focusing on core functionality
- Search/input for Team ID prominently placed

**Data Displays:**
- Card-based layout for chip recommendations
- Fixture difficulty tables with color-coded FDR ratings
- Progress indicators for gameweek analysis
- Badge components for chip types (Wildcard, Bench Boost, etc.)

**Forms:**
- Single prominent input for FPL Team ID
- Validation states with clear error messaging
- Loading states during API calls

**Key Features:**
- Gameweek timeline visualization
- Recommendation cards with clear action items
- Collapsible sections for detailed analysis
- Responsive grid layout for mobile optimization

**Visual Hierarchy:**
- Bold headers for each chip strategy section
- Color-coded difficulty ratings throughout
- Clear separation between analysis and recommendations
- Strategic use of whitespace for scan-ability

**Interaction Design:**
- Hover states on interactive elements
- Smooth transitions between loading and loaded states
- Clear focus states for accessibility
- Minimal animations to maintain professional feel

This design emphasizes clarity, data presentation, and actionable insights while maintaining the professional aesthetic expected in fantasy sports analysis tools.