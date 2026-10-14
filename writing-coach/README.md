# SG Primary English Writing Coach

This page is an additive feature in the `VirtualAIHuman` repository. The existing root `index.html` (Virtual AI Human prototype) is not replaced.

## Current files

- `writing-coach/index.html`: student-facing page.
- `agnes-worker/src/index.js`: secure server-side proxy to Agnes AI.
- `agnes-worker/wrangler.toml`: Cloudflare Workers configuration.

## Agnes API

The Worker uses the OpenAI-compatible Agnes endpoint `https://apihub.agnes-ai.com/v1/chat/completions` and model `agnes-2.5-flash`. Access, quotas and billing depend on the Agnes account/API key; verify them in the Agnes platform before use.

## Important: not connected until configured

1. Deploy the Worker using the Cloudflare Workers dashboard or Wrangler.
2. Add a Worker secret named `AGNES_API_KEY` containing the Agnes API key. Never commit this key to GitHub or put it in the browser page.
3. Copy the deployed Worker HTTPS URL into `API_BASE_URL` in `writing-coach/index.html`.
4. Enable GitHub Pages for this repository (if not already enabled) and open `/VirtualAIHuman/writing-coach/` under the repository's Pages domain.

The page has two endpoints:
- `POST /api/ocr`: transcribes an uploaded handwriting image. Students must check and correct the transcription before grading.
- `POST /api/grade`: grades the verified student text against the exact task prompt.

## Privacy and limitations

- No database or persistent essay storage is implemented.
- Essay text and uploaded images are sent to Agnes when the relevant button is pressed.
- Do not upload names, school details, contact information, or other sensitive personal data.
- The current report uses an internal rubric/config version, not an official MOE/SEAB scoring rubric.
- OCR and grading have not yet been live-tested against a configured Agnes API key.
