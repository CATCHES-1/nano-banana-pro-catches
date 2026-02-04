# CATCHES

CATCHES is an AI-powered image generation and editing application built with React and TypeScript. It uses Google's Gemini API to generate and transform images based on text prompts and reference images.

## Architecture Overview

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Database**: IndexedDB (browser-based client-side database)

### Backend
- **API Key Configuration**: The Gemini API key is configured in the backend, not in the frontend codebase
- **API Service**: Uses Google's Gemini API (`gemini-3-pro-image-preview` model)

## Local Database (IndexedDB)

CATCHES uses **IndexedDB** - a browser-based client-side database - to cache generated images locally. This allows:

- **Persistence**: Generated images persist across page refreshes
- **Performance**: Faster loading of previously generated images
- **Offline Access**: Users can view their cached images even without an internet connection

The database is automatically created when the app first runs:
- **Database Name**: `catches-db`
- **Store Name**: `generated-images`
- **Location**: Stored in the user's browser (not on a server)

The cache can be cleared using the "Clear" button in the UI, which removes all cached images from IndexedDB.

## Development Setup

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure API Key:**
   > **Note**: The API key is configured in the backend. Contact your team lead or backend developer for API key configuration details. The frontend does not require any API key setup.

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   The app will be available at `http://localhost:3000`

## Project Structure

```
├── components/          # React components
│   ├── Header.tsx       # App header component
│   ├── ImageUpload.tsx  # Image upload component
│   └── ...
├── services/           # API service layer
│   └── geminiService.ts # Gemini API integration
├── utils/              # Utility functions
│   ├── imageCache.ts   # IndexedDB caching utilities
│   ├── styleGenerator.ts
│   └── stringUtils.ts
├── types.ts            # TypeScript type definitions
├── App.tsx             # Main application component
└── vite.config.ts      # Vite configuration
```

## Key Features

- **Image Generation**: Generate images from text prompts
- **Image Editing**: Transform images using reference images and prompts
- **Style Seeds**: Deterministic style generation using numerical seeds
- **Aspect Ratios**: Support for multiple aspect ratios (1:1, 16:9, etc.)
- **Resolutions**: Support for 1K, 2K, and 4K resolutions
- **Search Grounding**: Optional web search grounding for enhanced context
- **Image Comparison**: Side-by-side comparison of original and generated images
- **Export**: Download individual images or export all as ZIP with metadata


## Building for Production

```bash
npm run build
```

The production build will be output to the `dist/` directory.

## Environment Variables

The following environment variables are used (configured in backend):
- `GEMINI_API_KEY`: Google Gemini API key (configured in backend)

## Browser Support

CATCHES requires a modern browser with support for:
- IndexedDB API
- ES6+ JavaScript features
- CSS Grid and Flexbox

## Troubleshooting

### Images not persisting after refresh
- Check browser IndexedDB support
- Check browser storage permissions
- Try clearing browser cache and reloading

### API errors
- Verify API key is configured correctly in the backend
- Check network connectivity
- Review browser console for detailed error messages
