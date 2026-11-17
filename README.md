# Ledgerly
> A full-stack personal finance dashboard with Machine Learning auto-categorization.

## 📖 Overview
Ledgerly is a monorepo application that allows users to upload bank transaction CSVs, automatically categorizes them using an ML model, and visualizes spending trends through an interactive dashboard. 

## 🛠 Tech Stack
- **Frontend:** React Native (Expo), TypeScript, Tailwind (via NativeWind)
- **Backend:** Node.js, Express, TypeScript, PostgreSQL (Supabase)
- **Machine Learning:** Python, FastAPI, Scikit-learn (TF-IDF + Logistic Regression)
- **Infrastructure:** Docker

## ✨ Features
- **Secure Auth:** JWT-based authentication with refresh tokens.
- **CSV Import:** Upload bank statements with robust validation and error handling.
- **ML Categorization:** A Python microservice auto-categorizes transactions with confidence scores.
- **Feedback Loop:** Users can manually correct a category, and the model can retrain.
- **Analytics:** Interactive charts for monthly spending, category breakdowns, and forecasting.

## 🚀 Local Setup
1. Clone the repo: 
   `git clone https://github.com/Sifundodube/Ledgerly.git`
2. Install dependencies: 
   `npm install`
3. Set up environment variables (see `.env.example` for required keys).
4. Run the backend: 
   `npm run dev --workspace=@ledgerly/backend`
5. Run the frontend: 
   `cd mobile && npx expo start`