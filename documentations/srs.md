# HealthScan System Documentation

## Version
1.0

## Last Updated
January 2026

---

## 1. Executive Summary

HealthScan is a personalized health-focused web application built using Next.js that helps users make informed food consumption decisions. By scanning product barcodes or uploading product labels via OCR, HealthScan evaluates food items against a user’s personal health profile and provides instant, explainable recommendations. An optional AI chatbot enhances understanding through interactive explanations, while deterministic health rules ensure safety, accuracy, and compliance.

---

## 2. Core Objectives

- Provide instant food safety recommendations
- Personalize decisions based on health conditions, allergies, BMI, and preferences
- Support unknown products via OCR and crowd-based validation
- Maintain a transparent, explainable decision system
- Offer optional AI-based conversational assistance
- Track scan history and health trends over time

---

## 3. User Roles

### 3.1 User
- Scans products
- Views dashboard and scan history
- Manages personal health profile
- Interacts with AI chatbot (optional)

### 3.2 Admin (Future Scope)
- Review promoted products
- Verify OCR-based entries
- Manage health rules and thresholds

---

## 4. System Architecture Overview

Frontend:
- Next.js (App Router)
- Barcode scanning (camera/manual)
- OCR upload interface
- Dashboard & scan history UI

Backend:
- API routes (Next.js / Node.js)
- Health rules engine
- OCR & NLP processing
- AI orchestration layer

Database:
- Normalized relational schema (PostgreSQL/MySQL)

AI Layer:
- LLM-based chatbot
- Context-driven, rules-constrained responses

---

## 5. User Health Profile Module

### 5.1 Personal Information
- Name, age, gender
- Height, weight
- Activity level

### 5.2 Automatic BMI Calculation
BMI is automatically calculated using height and weight.

BMI Categories:
- Underweight (<18.5)
- Normal (18.5–24.9)
- Overweight (25–29.9)
- Obese (≥30)

BMI is recalculated on profile updates and used to derive health insights.

### 5.3 Health Conditions
- Diabetes
- Hypertension
- Heart disease
- Kidney disease
- Others (extensible)

### 5.4 Allergies & Intolerances
- Milk, gluten, nuts, soy, etc.
- Severity-based handling

### 5.5 Dietary Preferences
- Vegetarian, vegan, keto, low-sugar, etc.

### 5.6 Personalized Nutrient Limits
- Sugar, sodium, fat, calories
- Configurable per user

---

## 6. Product Identification Module

### 6.1 Barcode Scan Flow
1. User scans barcode
2. System checks product database
3. If found → fetch product
4. If not found → redirect to OCR upload

### 6.2 OCR-Based Product Ingestion
- User uploads images of ingredients & nutrition label
- OCR extracts raw text
- NLP parses structured data
- Product stored as unverified

---

## 7. Unknown Product Promotion Logic

- Unknown products stored as candidate products
- Each scan increments scan count
- Promotion threshold (N) configurable via system settings
- Once scan_count ≥ N:
  - OCR data aggregated
  - Product promoted to main database
  - Marked as unverified

Anti-abuse:
- One scan per user per product per day
- OCR confidence thresholds

---

## 8. Health Decision Engine

### 8.1 Deterministic Rule Evaluation
Rules compare:
- Nutrients vs user limits
- Ingredients vs allergies
- Additives vs conditions

Outputs:
- Safe
- Consume with Caution
- Avoid

### 8.2 Instant Verdict Display
Shown immediately after scan:
- Verdict
- Brief reasoning
- Confidence level
- Data source (barcode/OCR)

No AI involved at this stage.

---

## 9. AI Chatbot (Optional)

### 9.1 Activation
- Activated only when user chooses
- No automatic chatbot invocation

### 9.2 Responsibilities
- Explain verdict
- Answer follow-up questions
- Suggest alternatives
- Clarify ingredients/additives

### 9.3 Constraints
- Cannot override verdict
- Uses only provided context
- Includes safety disclaimers

---

## 10. Scan History Module

### 10.1 Purpose
- Maintain immutable history of scans
- Allow review of past decisions
- Enable trend analysis

### 10.2 Stored Data
- Product or candidate reference
- Verdict & confidence
- Triggered health rules
- AI explanation (if used)
- Timestamp

### 10.3 Re-evaluation
- Optional re-scan creates new entry
- Old records remain unchanged

---

## 11. User Dashboard

### 11.1 Dashboard Components
- BMI & weight status
- Active health conditions
- Nutrition alerts
- Recent scans
- Dietary preferences

### 11.2 Insights
- Rules-based (non-AI)
- Updated dynamically on scans and profile changes

---

## 12. Data Privacy & Safety

- User data isolated per account
- No sharing of scan history
- AI provides informational, not medical advice
- OCR products clearly marked as unverified

---

## 13. Scalability & Extensibility

- Modular rules engine
- Configurable thresholds
- New health conditions easily added
- Admin moderation support (future)

---

## 14. Future Enhancements

- Product comparison
- Health trend analytics
- Goal tracking (weight, sugar)
- Admin dashboard
- Multilingual support

---

## 15. Conclusion

HealthScan combines deterministic health logic, user-centric design, and optional AI assistance to create a trustworthy, scalable, and personalized food safety platform. The system prioritizes transparency, performance, and user control while remaining extensible for future growth.
