# IdeaMills - AI Creative Platform

IdeaMills is an AI-powered creative platform for generating marketing concepts, scripts, and storyboards. It leverages Large Language Models (LLMs) and Image Generation Models to automate the pre-production workflow.

## 🚀 Key Features

- ✅ **Automated Storyboarding**: Generate detailed scripts and storyboards from product images and basic ideas.
- ✅ **AI-Powered**: Uses OpenAI (GPT-4o/5.2) and Google Gemini for creative logic.
- ✅ **Visual Intelligence**: Analyzes product images to ensure brand consistency.
- ✅ **Local Architecture**: Fully self-contained with local MongoDB and file storage.
- ✅ **Background Processing**: Dedicated worker system for handling long-running AI tasks.

## 🏗️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes & Node.js Worker
- **Database**: MongoDB (Local) with GridFS for image storage
- **AI**: OpenAI (GPT-4o, DALL-E 3), Google Gemini

## 📦 Installation & Setup

### Prerequisites

- Node.js 18+
- MongoDB Community Edition (installed locally or via Docker)
- OpenAI API Key

### Setup Steps

1.  **Clone the repository:**
    ```bash
    git clone <repo-url>
    cd ideamills
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Copy the example configuration and add your API keys.
    ```bash
    cp .env.example .env.local
    ```
    *See `ENV.md` for detailed configuration instructions.*

4.  **Start the System:**
    Use the provided start script to launch MongoDB, the Next.js app, and the Worker simultaneously.
    ```bash
    ./start.sh
    ```

5.  **Access the App:**
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 How to Use

1.  **Input Details**: Enter product name, description, and upload product images.
2.  **Configure**: Select target audience, platform (Instagram/TikTok), and duration.
3.  **Generate Ideas**: Get AI-generated creative concepts.
4.  **Create Storyboard**: Select a concept to generate a full Director's Script and visual storyboard.
5.  **Review**: View the timeline, script, and generated images side-by-side.

## 🏗️ Architecture

The system uses a **monorepo** structure with a shared MongoDB database.

*   **Next.js App**: Handles UI and API requests.
*   **Worker**: Processes background jobs (AI generation).
*   **MongoDB**: Stores generation data, scripts, and images (GridFS).

For detailed technical specifications, please refer to `TECHNICAL_SPECIFICATIONS.md`.
