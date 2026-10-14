# VirtualAIHuman

An independent, responsive static prototype for testing a user-selected portrait with browser speech features.

## Current prototype

- Responsive layout for desktop and mobile.
- The user selects their own image locally in the browser. The image is not automatically uploaded to GitHub or a server.
- Text input, simple preset demo responses, browser text-to-speech, and optional browser speech recognition.
- No database, API key, external AI service, or server required for the static demo.

## Important limitations

This is **not yet a real-time talking-photo AI**. The portrait remains still; speech is not synced to the mouth. Replies are preset demo responses, not a full AI model. Browser speech recognition availability and privacy behavior depend on the browser and may require internet access.

## Privacy and deployment

The reference photo is intentionally not committed to this repository. Select the photo locally in the webpage instead. Do not commit private photos or sensitive material unless you have permission and intend to publish them.

GitHub Pages can host the static frontend, but it cannot run MuseTalk or other Python/GPU inference models. Photo-driven lip-sync and free-form AI conversation would require a separate inference/API service, whose free quotas and availability must be verified.

## Local test

Open `index.html` in a recent desktop browser. For microphone tests, browser security restrictions may require localhost or HTTPS. For example, run `python -m http.server 8000` in this folder and open `http://localhost:8000`.

## Next milestone

1. Test the static page and browser voice functions.
2. Evaluate a separate photo-driven lip-sync inference service.
3. Check pricing, latency, data retention, and mobile support before integration.
