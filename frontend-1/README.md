# Zeiv Procure - Procurement Management System

A comprehensive procurement management system built with React, TypeScript, and modern web technologies.

## Features

- **Purchase Requisition Management**: Create and manage purchase requisitions with workflow approval
- **Purchase Order Processing**: Generate and track purchase orders
- **Invoice Management**: Handle invoice creation and processing
- **Master Data Management**: Manage suppliers, items, organizations, and other master data
- **Workflow Management**: Configurable approval workflows
- **Reporting & Analytics**: Comprehensive reporting and insights
- **AI-Powered Chat**: Intelligent assistance for procurement tasks

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI Components**: Shadcn/ui, Tailwind CSS
- **State Management**: React Query, Context API
- **Routing**: React Router DOM
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Clerk
- **AI Integration**: AI SDK
- **PDF Generation**: React PDF Renderer
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd zeiv-procure
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Project Structure

```
src/
├── components/          # Reusable UI components
├── pages/              # Page components
├── contexts/           # React contexts
├── hooks/              # Custom React hooks
├── services/           # API services
├── utils/              # Utility functions
├── models/             # TypeScript models
├── config/             # Configuration files
└── integrations/       # Third-party integrations
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is proprietary software owned by Zeiv.

## Support

For support and questions, please contact the development team.
