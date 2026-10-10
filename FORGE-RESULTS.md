# Forge results and provenance

## Direct access

- **Forge demo:** https://5173-i2xs0z3x8gt4b98xzq7ug-0fd74d1b.us4.manus.computer/?forgeDemo=all
- **GitHub commit:** https://github.com/davidsonking112-netizen/Websat/tree/ef98a35
- **Current readability commit:** available in the repository after the latest push

## Delivered artifacts

- [Forge Canvas screenshot](./forge-canvas.png)
- [Forge fuel-subsidy chat screenshot](./forge-chat.png)
- [Forge coding chat screenshot](./forge-code.png)
- [Forge 52-message debate screenshot](./forge-debate.png)
- [Forge code/math readability screenshot](./forge-readable.png)
- [AI-generated demo content used by Forge](./demo-content.js)

The demo contains the 450-word Nigeria fuel-subsidy essay, an eight-slide outline in Canvas, a 52-message 2012 Gen Z/Gen Alpha debate, and a four-message coding refactor thread.

## Models used

The content-generation model was **`gpt-5-mini`** through the configured OpenAI-compatible API endpoint. The request asked for JSON containing the essay, eight slides, 52 alternating debate messages, and a coding thread. The output was checked for the requested counts before being loaded into Forge.

No Manus image, video, or presentation-generation job was used. The Forge prototype was run with its local model/provider disabled for this demo route; therefore the demo content was generated externally by the configured model and then rendered and persisted by Forge's client-side workspace.

## What Forge actually did

Forge genuinely did the following:

- Loaded the demo pack through its own URL-triggered state loader.
- Rendered the essay and eight-slide outline in the Canvas editor.
- Rendered the coding thread and debate thread in the Chat UI.
- Provided local thread navigation, Canvas editing, and browser-visible persistence behavior.
- Rendered the new numbered/syntax-highlighted code blocks and formula blocks.

Forge did **not** independently originate the demo content or call the model during this route. Saying that Forge autonomously completed the entire research task would be inaccurate. The honest description is: **the model generated the content, Forge rendered and hosted the workspace experience, and Manus orchestrated the repository changes and verification.**

## Forge versus Manus

| Capability | Forge | Manus in this task |
|---|---|---|
| Chat/Canvas interface | Yes; executed in the browser | Inspected and extended the interface |
| Local state and thread navigation | Yes | Tested it with browser automation |
| Model call for this demo pack | No; provider was disabled on the demo route | Used the configured `gpt-5-mini` API access |
| Research/source gathering | No autonomous web research in this route | Gathered IMF, World Bank, Pew, and McCrindle sources |
| Code changes and Git push | No | Implemented, tested, committed, and pushed |
| Standardized quality score | Not implemented in Forge | No benchmark score was run |

There is no defensible numerical Forge-versus-Manus score from this run. The available evidence is functional: 12/12 source tests pass, the production build passes, the public preview returned HTTP 200, and browser checks found 0 page errors with 8 slides, 52 debate messages, and a rendered formula/code example.
