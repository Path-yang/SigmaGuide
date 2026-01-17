# SigmaGuide

AI-powered screen guidance assistant that watches your screen and provides step-by-step instructions for any software.

![SigmaGuide](https://img.shields.io/badge/Electron-28.1.0-47848F?style=flat-square&logo=electron)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-3178C6?style=flat-square&logo=typescript)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=flat-square&logo=openai)

## ✨ Features

- **🖥️ Screen Capture**: Automatically captures and analyzes your screen
- **🤖 AI Vision**: Uses OpenAI GPT-4o to understand what's on screen
- **📋 Task Decomposition**: Breaks down any task into atomic, actionable steps
- **✅ Progress Tracking**: Detects when you complete each step automatically
- **💬 Chat Interface**: Natural conversation to ask questions about any software
- **🎯 Always-On-Top Sidebar**: Non-intrusive overlay on the right side of your screen

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/sigmaguide.git
cd sigmaguide

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Add your OpenAI API key to .env
# VITE_OPENAI_API_KEY=your_api_key_here
```

### Development

```bash
# Start in development mode
npm run electron:dev
```

### Build

```bash
# Build for production
npm run electron:build
```

## 🎮 Usage

1. **Launch SigmaGuide** - The sidebar appears on the right side of your screen
2. **Toggle visibility** - Press `⌘/Ctrl + Shift + G` to show/hide
3. **Ask a question** - e.g., "How do I freeze the top row in Excel?"
4. **Follow the steps** - SigmaGuide analyzes your screen and guides you
5. **Auto-advance** - It detects when you complete each step and moves to the next

### Example Queries

- "How do I freeze the top row in Excel?"
- "Help me create a new branch in VS Code"
- "How do I split my screen on Mac?"
- "Show me how to add a formula in Google Sheets"
- "How do I merge cells in Numbers?"

## 🏗️ Architecture

```
sigmaguide/
├── electron/
│   ├── main.ts          # Electron main process, window setup
│   └── preload.ts       # IPC bridge for screen capture
├── src/
│   ├── components/      # React UI components
│   │   ├── ChatSidebar.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageInput.tsx
│   │   └── Header.tsx
│   ├── agents/          # AI agents
│   │   ├── orchestrator.ts    # Coordinates all AI calls
│   │   ├── screenAnalyzer.ts  # Analyzes screenshots
│   │   └── taskDecomposer.ts  # Breaks tasks into steps
│   ├── stores/          # Zustand state management
│   │   ├── chatStore.ts
│   │   └── taskStore.ts
│   ├── lib/             # Utilities
│   │   ├── openai.ts    # OpenAI API client
│   │   └── prompts.ts   # System prompts
│   └── App.tsx
├── .env                 # Environment variables
└── package.json
```

## 🔧 Tech Stack

- **Electron** - Desktop app framework
- **React** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast bundling
- **TailwindCSS** - Styling
- **Zustand** - State management
- **OpenAI GPT-4o** - Vision + Text AI

## ⚙️ Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_OPENAI_API_KEY` | Your OpenAI API key |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘/Ctrl + Shift + G` | Toggle sidebar visibility |
| `Enter` | Send message |
| `Shift + Enter` | New line in input |

## 🔒 Privacy

- Screen captures are processed locally and sent only to OpenAI API
- No data is stored or logged on external servers
- API calls are made directly to OpenAI's API

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

Built with ❤️ using Electron, React, and OpenAI
