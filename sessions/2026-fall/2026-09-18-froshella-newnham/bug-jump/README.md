# GDG Bug Jump

The game we ran at our Froshella table on 18 September 2026. You jump in front of the camera and the dino jumps with you. Dodge 5 bugs to spin the prize wheel, then scan the QR code to join the chapter.

Play it: [gdg-bug-jump.vercel.app](https://gdg-bug-jump.vercel.app)

It runs entirely in the browser. There is no server, no build step, and no API key. The camera video never leaves the device.

## Run it yourself

```bash
git clone https://github.com/GDG-on-Campus-Seneca-Polytechnic/info.git
cd info/sessions/2026-fall/2026-09-18-froshella-newnham/bug-jump
python3 -m http.server 8000
```

Open http://localhost:8000 and allow camera access. Browsers only allow the camera on `localhost` or `https`, so opening `index.html` straight from the file system will not work.

No camera? Tap the screen or press Space to jump.

To put it online, deploy this folder to any static host, for example `vercel deploy`, Firebase Hosting, or GitHub Pages.

## How it works

| File | What it does |
|---|---|
| `index.html` | The screens: start, game over, prize wheel, and staff settings |
| `app.js` | The game loop, sprites, scoring, and settings |
| `pose.js` | Jump detection. [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) finds your shoulders in each camera frame. When they rise past a line scaled to your shoulder width, that counts as a jump. |
| `wheel.js` | The prize wheel. Each slice is sized by its weight, so what you see is the real chance of winning it. |
| `sw.js` | Saves every file on first visit, so the game still works when the wifi drops |
| `vendor/` | MediaPipe, the pose model, the QR code library, and fonts, copied in so nothing loads from the internet |

## Staff settings

Tap the logo three times, or press S on a keyboard. You can change:

- How many bugs to dodge for a spin
- Jump sensitivity. Lower it if small jumps don't count, raise it if people trigger jumps by moving around.
- The prizes and their weights
- The link in the join QR code
- Sound and camera on or off

Settings are saved on that device only.

## Running it at a table

- Open the link once with good wifi. On an iPad, use Share, then Add to Home Screen, so it opens full screen.
- Stand the device at chest height, with about two metres of space in front of it.
- Test the jump sensitivity with a few people before the crowd arrives.

## Make it yours

Some ideas if you want to remix it:

- Swap the bugs for something else in `app.js`. Each sprite is a grid of `#` characters.
- Detect a different move in `pose.js`, like arms up or a squat.
- Add a leaderboard.

## Credits

- [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) and the pose landmarker model by Google, Apache License 2.0
- [qrcode-generator](https://www.npmjs.com/package/qrcode-generator), MIT License
- [Google Sans Flex](https://fonts.google.com/specimen/Google+Sans+Flex) and [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans), SIL Open Font License 1.1. License texts are in `vendor/fonts/`.
- Google Developer Groups logo used under the GDG on Campus brand guidelines
