# SG Primary English Writing Coach

This is an additive feature in `aplusachiever2025-create/VirtualAIHuman`. The existing root homepage and VirtualAIHuman prototype are not replaced. The formal `app` repository is not involved.

## Files

- `writing-coach/index.html`: student-facing writing coach.
- `api/grade.js`: Vercel serverless endpoint for assessment.
- `api/ocr.js`: Vercel serverless endpoint for handwriting transcription.
- `agnes-worker/`: earlier Cloudflare implementation retained as a fallback; it is not required for the Vercel setup.

## Deploy with Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Import the GitHub repository `aplusachiever2025-create/VirtualAIHuman`.
3. Deploy it as a separate Vercel project. This does not change GitHub Pages or the existing root homepage on GitHub.
4. In the Vercel project, open **Settings → Environment Variables**.
5. Add the environment variable `AGNES_API_KEY`, paste the Agnes API key into its value field, and enable it for Production (and Preview only if needed). Save it as a server-side environment variable, not in source code.
6. Redeploy after saving the variable.
7. Copy the Vercel deployment's HTTPS origin, for example `https://your-project.vercel.app`.
8. Open `writing-coach/index.html` in GitHub and replace `PASTE_VERCEL_API_URL_HERE` in `API_BASE_URL` with that HTTPS origin. Commit the change.
9. Open the GitHub Pages writing coach page and test text grading first, then test OCR with a small image.

## API

- `POST /api/grade`: assesses a student response against the exact task prompt.
- `POST /api/ocr`: transcribes a JPG, PNG, or WebP handwriting image. Review and correct the transcription before grading.

The API uses the OpenAI-compatible Agnes endpoint `https://apihub.agnes-ai.com/v1/chat/completions` with model `agnes-2.5-flash`. Actual access, model availability, quotas, and charges depend on the Agnes account.

## Security, privacy and limits

- Never paste the API key into ChatGPT or commit it to GitHub. Enter it only in Vercel's Environment Variables.
- This project does not store essays in a database. When the user presses OCR or Grade, the image or text is sent to Agnes for processing.
- Avoid uploading students' full names, school details, addresses, or other sensitive personal data.
- Image uploads are limited to approximately 2.5 MB to fit serverless request limits.
- AI feedback and any reference score are not official MOE/SEAB marks.
- OCR and grading still need live testing with the user's configured Agnes key; do not consider the integration complete until both endpoints have been tested.
