# XLNC Care web app: setup guide

This guide puts XLNC Care on its own web address, for example **https://YOURNAME.github.io/xlnc-care/**. Staff, managers and you open that link and sign in. Nobody needs a claude.ai account.

It uses two free services:

- **Supabase** keeps the data, the files and the sign-ins.
- **GitHub Pages** hosts the web pages. (Netlify works too — see step 5B.)

AI writing (Claude fills the incident report, writes the quarterly report, reads referrals) is **optional** and costs a few cents per report. Without it, the app still fills every form from saved data and you type the parts that need words. See "Turn on AI writing" near the end.

The whole setup takes about 30 minutes. Do the steps in order.

---

## Before you start: a privacy note

XLNC Care holds residents' health information, including names, diagnoses, medications and incident reports.

- The **free plans of Supabase, GitHub Pages and Netlify do not sign a HIPAA Business Associate Agreement (BAA)**. Supabase offers HIPAA only as a paid add-on on its Team and Enterprise plans.
- If you turn on AI writing, resident details in each request are sent to **Anthropic** (the company that makes Claude) to be processed. Ask management whether a BAA with Anthropic is needed first.
- **Check with management or your compliance advisor before you put real resident data in.** You can do every step below and test with made-up data first. If you need a BAA later, upgrade Supabase to a HIPAA plan. The app does not need to change.

---

## 1. Create a free Supabase project

1. Go to **https://supabase.com** and sign up. You can use "Continue with GitHub" or your email.
2. Click **New project**.
   - **Name:** `xlnc-care`
   - **Database password:** click **Generate**, then save the password somewhere safe. The app does not use it, but you may need it later.
   - **Region:** choose **West US (North California)**, which is closest to San Diego.
3. Click **Create new project** and wait about 2 minutes until it is ready.

## 2. Put the Supabase address and key into `config.js`

1. In Supabase, open **Project Settings** (the gear icon), then **API** (it may be called **Data API**).
2. Copy the **Project URL**. It looks like `https://abcdxyz.supabase.co`.
3. Copy the **anon public** key. It is a long piece of text that starts with `eyJ`.
4. On your computer, open the file **`config.js`** in this folder with a plain text editor (Notepad, or TextEdit in plain-text mode).
5. Replace the two `PASTE_HERE` values. Keep the quote marks:

   ```js
   SUPABASE_URL: "https://abcdxyz.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...the whole key..."
   ```
6. Save the file.

> Never paste the **service_role** key into `config.js`. Only the **anon public** key goes there.

## 3. Create the tables and the access rules

1. In Supabase, open **SQL Editor** and click **New query**.
2. Open **`supabase/schema.sql`** from this folder, copy everything in it, and paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned".

This creates the data table, the people and roles table, live updates, and the private **files** storage. It also sets the rules for who can see and change what. Running it a second time is safe.

## 4. Set up sign-in

In Supabase, open **Authentication**:

1. **Turn off public sign-ups.** Go to **Sign In / Providers** (on some screens this is **Providers → Email**). Switch **Allow new users to sign up** to **off**. After this, only people you add can get in. Keep the **Email** provider turned on.
2. **Set your website address.** Go to **URL Configuration**:
   - **Site URL:** your app's address from step 5, for example `https://YOURNAME.github.io/xlnc-care/` (GitHub Pages) or `https://xlnc-care.netlify.app` (Netlify).
   - **Redirect URLs:** click **Add URL** and add the same address followed by `**`, for example `https://YOURNAME.github.io/xlnc-care/**`

   Invitation and password-reset emails bring people back to this address, so it must match exactly (including `/xlnc-care/` on GitHub Pages).
3. **Emails (invitations and "Forgot password?").** Supabase's built-in email only sends to members of your Supabase team, and only about **2 emails per hour**. You have two options:
   - **Simplest:** don't rely on email. Add each person yourself with a temporary password (see step 8). Each person can change their password inside the app with **🔑 Password**.
   - **Better, still free:** connect a free email service such as Resend or Brevo under **Authentication → Emails → SMTP Settings**. After that, invitations and "Forgot password?" emails reach anyone. The default email templates are fine and need no changes.

## 5. Put the website online

### 5A. GitHub Pages (recommended)

1. Sign in at **https://github.com** (free account).
2. Create a new repository named **`xlnc-care`** and upload everything inside the `xlnc-care-app` folder to it: the files must sit at the top of the repository, next to `index.html`. Include the hidden file `.nojekyll`. (Someone may push the folder for you; that's fine.)
3. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch **`main`**, folder **`/ (root)`**, and click **Save**.
4. After a minute the page shows your address, for example **`https://YOURNAME.github.io/xlnc-care/`**. Open it.
5. Put that exact address into Supabase **URL Configuration** (step 4.2).

> On a free GitHub account the repository must be **public** for Pages to work. That's OK: the folder contains only the app's code and the public "anon" key — no resident data. Never upload the export file or attachments to GitHub.

### 5B. Netlify Drop (alternative)

1. Go to **https://app.netlify.com** and sign up for free. You need an account so the site stays online.
2. Open **https://app.netlify.com/drop** and drag the whole **`xlnc-care-app`** folder onto the page.
3. To change the random name, open **Site configuration → Change site name** and type **`xlnc-care`** (address `https://xlnc-care.netlify.app`).
4. Put that address into Supabase **URL Configuration** (step 4.2).

Open the address. If you see **"Setup needed"**, `config.js` still contains `PASTE_HERE`. Go back to step 2, then upload again.

## 6. Make yourself the owner

1. In Supabase, go to **Authentication → Users → Add user**. Choose **Create new user**, enter `laxmi@xlncexotic.com` and a password, tick **Auto Confirm User**, and click **Create**. If you set up email in step 4.3, you can use **Send invitation** instead.
2. Open your site and sign in once. You will see **"Almost there"**. That is expected.
3. In Supabase, go to **SQL Editor → New query** and run this one line:

   ```sql
   update profiles set role='owner' where email='laxmi@xlncexotic.com';
   ```
4. Reload the site. You are now the owner.

## 7. Bring in your data from claude.ai

1. Have these ready on your computer: the export file **`xlnc-care-data.json`** and its **`files`** folder of attachments.
2. In XLNC Care, tap **⬆ Import data** at the top.
3. Pick **`xlnc-care-data.json`**. Then pick the attachments: either select all the files inside the `files` folder, or pick the folder itself.
4. Tap **Start import** and wait until it says **"All done"**. Then tap **Reload the app**.

You can run the import again safely. It overwrites records with the same data and skips files that are already uploaded.

> Keep the export file and the `files` folder **out** of the `xlnc-care-app` folder. Everything in that folder is published on the website.

## 8. Add staff and managers

1. In Supabase, go to **Authentication → Users → Add user**:
   - **Create new user:** enter their email and a temporary password, tick **Auto Confirm User**, and then tell them the password; **or**
   - **Send invitation** (only if you set up email in step 4.3): they get an email and choose their own password.
2. Ask them to open the site and sign in once.
3. In XLNC Care, tap **👥 Team**. Find them in the list, choose their role, and tap **Save**:
   - **Staff** can see residents, homes, forms, the schedule, the calendar and visits. They can write daily notes, meds (eMAR), out and back in, incidents, visits and calendar entries.
   - **Manager** can see everything except other people's private logins, and cannot change anything.
   - **Owner** can do everything, including SSI, grocery, behaviourist, e-billing, Team and Import.
   - **No access yet** blocks the person. Use it to remove someone, or delete the user in Supabase.
4. They reload the page and they are in. They can change their password with **🔑 Password**.

## 9. Add it to your phone's home screen

- **iPhone:** open the site in **Safari**, tap **Share**, then **Add to Home Screen**.
- **Android:** open the site in **Chrome**, tap **⋮**, then **Add to Home screen** (or **Install app**).

It opens full screen with the purple XC icon, like a normal app.

---

## Updating the app later

1. Change the files in the `xlnc-care-app` folder, or replace them with a new version. **Keep your filled-in `config.js`.**
2. **GitHub Pages:** upload the changed files to the repository (or push them); the site updates within a minute or two.
   **Netlify:** open your site, go to **Deploys**, and drag the whole folder onto the box that says "drag and drop your site output folder here".
3. Phones pick up the new version the next time the app is opened. If not, close the app and open it again.

Your data stays in Supabase and is not affected by updates. If a new version comes with a new `supabase/schema.sql`, run it again as in step 3.

## Free plan limits (late 2026)

**Supabase Free:**
- 500 MB database
- 1 GB file storage, with files up to 50 MB each (the app limits files to 20 MB)
- 5 GB of data transfer per month
- 200 people connected live at the same time
- 2 free projects
- **A project pauses after 1 week with no activity.** Daily use keeps it awake. If it does pause, open the Supabase dashboard and click **Restore**.

**GitHub Pages / Netlify Free:** plenty for a small team using a static site like this one.

XLNC Care's text data is small; the current export is about 0.13 MB. Photos and PDFs use the 1 GB of file storage.

## Reports and forms without AI (free)

Without AI writing, the app fills everything it can from saved data and leaves the "writing" parts to you:

- **Admission packet** (📦): all nine state forms (LIC 601, 602A, 603, 605A, 613, 621, 622, 625, 627C) are filled from the resident's and home's details — names, dates, phone numbers, doctor, insurance, diagnosis, medications, allergies and so on. Signature and signature-date boxes are always left blank. Print, check, sign.
- **Incident report (SIR)**: tapping **✨ Fill SIR** fills the header, date and time, AM/PM, who was notified (licensing, parent/guardian, service coordinator) and copies the staff summary into the description. Under **✎ Edit**, tick the incident type(s) and location and write the prevention plan, then **⬇ SIR PDF**.
- **Quarterly report (QRT)**: **✨ Write QRT** starts the report with the introduction facts, appointments and outings of the quarter and the target behaviors. Under **✎ Edit**, write the daily living skills, monthly behaviour counts, summaries and yearly comments, then **⬇ Word**.
- **Referral PDF**: uploading a referral opens an empty details form — type the details from the referral. The referral is saved with the resident and the admission packet is filled as usual.

The **📋 My daily report** link still opens the separate claude.ai page.

## Turn on AI writing (optional)

With AI on, Claude writes the SIR description and prevention plan, writes the whole QRT from the daily notes, and reads referral PDFs (also scanned ones). Only **owner** and **staff** can use it. The secret key stays on Supabase's server — it is never in the web pages.

**Cost:** roughly **1¢ per incident report**, and about **5–15¢ per quarterly report or referral** (bigger documents use the stronger model). Each person is limited to 60 AI requests per hour so a mistake can't run up a bill.

**Privacy:** each request sends that resident's details to Anthropic. **Check with management first** (whether a Business Associate Agreement with Anthropic is required).

1. **Create an Anthropic account:** go to **https://console.anthropic.com**, sign up, open **Billing** and add a payment method with a small amount of credit (for example $10).
2. **Set a spending limit:** in the Console, open **Settings → Limits** and set a monthly spend limit (for example $20).
3. **Create a key:** open **API Keys → Create Key**, name it `xlnc-care`, and copy it (it starts with `sk-ant-`). You can only see it once.
4. **Add the AI function in Supabase:** open your project → **Edge Functions** → **Deploy a new function** → **Via Editor**. Name it exactly **`ai`**. Delete the sample code, open **`supabase/functions/ai/index.ts`** from this folder, copy all of it, paste it in, and click **Deploy**. Leave **Verify JWT** turned on.
5. **Add the key:** in **Edge Functions → Secrets** (or **Project Settings → Edge Functions**), add a secret named **`ANTHROPIC_API_KEY`** with the key from step 3, and save.
6. Make sure you have run the latest `supabase/schema.sql` (step 3) — it creates the `ai_usage` table the function uses for the hourly limit.
7. Reload XLNC Care. The ✨ buttons now use Claude.

Optional secrets: `AI_MODEL_DEFAULT` (default `claude-haiku-5-5`), `AI_MODEL_COMPLEX` (default `claude-sonnet-5-5`), `AI_HOURLY_LIMIT` (default `60`).

**To turn AI off again,** delete the `ANTHROPIC_API_KEY` secret (or the `ai` function). The app goes back to the free way automatically.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Setup needed" | `config.js` still contains `PASTE_HERE`. Do step 2, then upload the folder again. |
| Email links open the wrong page or say "redirect not allowed" | The Site URL / Redirect URL in Supabase (step 4.2) doesn't exactly match your app's address. |
| ✨ buttons only fill the basic details (no written description or QRT text) | Normal without AI. To use AI, see "Turn on AI writing". If you did set it up: check the function is named exactly `ai`, the `ANTHROPIC_API_KEY` secret is saved, you ran the latest `schema.sql`, and you are signed in as owner or staff. |
| "That email and password don't match" | Check for typos, or ask Laxmi to set a new temporary password. In Supabase, go to **Authentication → Users**, click the person, then **Send password recovery** (needs email) or delete and re-add them. |
| "Almost there" | The person has no role yet. Set it in **👥 Team**. |
| "Not saved — view only?" | That role may not change this part of the app. For example, staff cannot edit SSI or homes. |
| The email link "has expired" | Links work once and expire after about an hour. Use **Forgot password?** again, or send a new invitation. |
| Photos or PDFs don't open | Reload the page while signed in. Files load only for signed-in people. |
