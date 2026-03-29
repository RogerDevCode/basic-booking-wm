# 🔐 Credentials Setup Guide - Booking Titanium

This guide provides step-by-step instructions to obtain and configure the necessary credentials for the Booking Titanium system to be 100% operational.

---

## 1. Gmail SMTP (App Password)
The system currently uses Go's `net/smtp` package, which requires standard SMTP credentials. Since Gmail has deprecated "Less Secure Apps," you must use an **App Password**.

### Steps:
1.  Go to your [Google Account](https://myaccount.google.com/).
2.  Select **Security** on the left navigation panel.
3.  Under "How you sign in to Google," make sure **2-Step Verification** is turned **ON**.
4.  Click on **2-Step Verification**.
5.  Scroll to the bottom and click on **App passwords**.
6.  Enter a name (e.g., "Booking Titanium Go").
7.  Click **Create**.
8.  **Copy the 16-character password** displayed in the yellow bar.

### .env Configuration:
```bash
GMAIL_USERNAME="your-email@gmail.com"
GMAIL_PASSWORD="abcd efgh ijkl mnop" # The 16-char code without spaces (or with, Go handles it)
```

---

## 2. Google Calendar (Service Account)
For server-to-server interaction without user intervention, a **Service Account** is required.

### Steps:
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Select or create your project (**Booking Titanium**).
3.  Go to **APIs & Services > Library**. Search for **Google Calendar API** and ensure it is **Enabled**.
4.  Go to **IAM & Admin > Service Accounts**.
5.  Click **+ CREATE SERVICE ACCOUNT**.
6.  Provide a name (e.g., `booking-service-account`) and click **Create and Continue**.
7.  (Optional) Grant the "Editor" role if needed, or leave blank for fine-grained permissions. Click **Done**.
8.  In the list of service accounts, click on the **Email** of the one you just created.
9.  Select the **Keys** tab.
10. Click **Add Key > Create new key**.
11. Select **JSON** and click **Create**.
12. A JSON file will download. **Open it and copy the entire content.**

### Calendar Permissions:
1.  Open [Google Calendar](https://calendar.google.com/).
2.  Find the calendar you want to use (usually your primary or a new one).
3.  Click **Settings and sharing**.
4.  Scroll down to **Share with specific people or groups**.
5.  Click **+ Add people and groups**.
6.  Paste the **Service Account Email** (found in your JSON file).
7.  Set permissions to **Make changes to events**.
8.  Copy the **Calendar ID** (usually your email or a long string ending in `@group.calendar.google.com`).

### .env Configuration:
```bash
# Paste the entire JSON as a single-line string or use a reference
GOOGLE_CREDENTIALS_JSON='{"type": "service_account", ...}'
GCALENDAR_ID="primary" # Or the specific Calendar ID
```

---

## 3. PostgreSQL (Neon standard URI)
Neon provides a connection string. Ensure it follows the standard URI format for maximum compatibility.

### Format:
`postgresql://[user]:[password]@[host]:[port]/[database]?sslmode=require`

### .env Configuration:
```bash
NEON_DATABASE_URL="postgresql://neondb_owner:npg_...-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require"
```

---

## 4. Telegram Bot Token
Already configured and verified in your `.env`.

---

## 🔍 Validation
After updating `.env`, run the diagnostic tool again:
```bash
go run cmd/diagnostics/main.go
```
