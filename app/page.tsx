import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <span className="hero-badge">🔬 AI-Powered Health Analysis</span>
        <h1>Know What You Eat,<br />Stay Healthy</h1>
        <p className="hero-subtitle">
          Scan any food product and get instant, personalized health recommendations
          based on your conditions, allergies, and dietary preferences.
        </p>
        <div className="hero-actions">
          <Link href="/signup" className="hero-btn hero-btn-primary">
            Get Started Free
          </Link>
          <Link href="/login" className="hero-btn hero-btn-outline">
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <div className="features-header">
          <h2>Everything You Need</h2>
          <p>Comprehensive food safety analysis, personalized for you.</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📸</div>
            <h3>Barcode Scanning</h3>
            <p>
              Enter a barcode to instantly look up any product in our database.
              Get nutrition facts, ingredients, and health analysis in seconds.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🧬</div>
            <h3>Health Profile</h3>
            <p>
              Set up your health conditions, allergies, BMI, and dietary
              preferences. Every scan is evaluated against your unique profile.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🛡️</div>
            <h3>Smart Verdicts</h3>
            <p>
              Deterministic rules engine evaluates products as Safe, Caution, or
              Avoid — with transparent reasoning and no black-box AI decisions.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3>AI Assistant</h3>
            <p>
              Optional AI chatbot explains verdicts, suggests alternatives, and
              answers your food health questions with safety disclaimers.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Dashboard & Insights</h3>
            <p>
              Track your scan history, view health trends, and get personalized
              nutrition alerts based on your profile and scan patterns.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📝</div>
            <h3>Community OCR</h3>
            <p>
              Product not found? Upload label data via OCR. Community scans
              help build our database for everyone.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
