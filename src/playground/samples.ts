import type { DestinationId, PastePayload } from '../engine';

export interface Sample {
  id: string;
  from: string;
  to: string;
  destination: DestinationId;
  /** What goes wrong with a normal paste. */
  problem: string;
  payload: PastePayload;
}

// Built from char codes so the invisible characters are visible in review.
const NBSP = String.fromCharCode(0xa0);
const ZWSP = String.fromCharCode(0x200b);

const chatgptReply = `## Q3 launch update

Hi team — here's where we landed after Thursday's review.

**What shipped**
- Self-serve onboarding is live for *all* new workspaces
- Median setup time dropped from 14 minutes to **under 4**
- The billing migration finished with zero downtime

**Next steps**
1. Finalize pricing page copy (owner: Priya)
2. Run the win-back campaign for churned trials
3. Share the full retro — notes are [in the launch doc](https://example.com/launch-retro)

Let me know if anything here looks off before I send it to leadership.`;

const pdfExcerpt = `Remote Collaboration Study
Distributed teams that adopted written decision records reported fewer
meetings and faster onboarding. The effect was strongest when the prac-
tice was introduced early, before team norms had formed, and when man-
agers modeled it themselves.
Key findings
•  Teams wrote 38% fewer status updates after adopting async check-ins.
•  New hires reached full productivity roughly two weeks sooner.
•  Meeting load fell most for engineers, and least for managers, who
   continued to act as information routers.
These results held across all eleven organizations in the sample.`;

const websiteHtml = `<meta charset="utf-8"><h2 style="font-family: Georgia, serif; font-size: 34px; color: rgb(17, 24, 39); letter-spacing: -0.5px; margin: 0px 0px 24px;">Rate limits</h2><p style="font-family: Inter, sans-serif; font-size: 17px; line-height: 1.8; color: rgb(55, 65, 81); background-color: rgb(255, 251, 235);">Every API key is limited to <strong style="font-weight: 600;">600 requests per minute</strong>. When you exceed it, the API responds with <code style="background: rgb(243, 244, 246); padding: 2px 6px; border-radius: 4px; font-size: 14px;">429 Too Many Requests</code> and a <code style="background: rgb(243, 244, 246); padding: 2px 6px;">Retry-After</code> header.</p><ul style="font-family: Inter, sans-serif; font-size: 17px; color: rgb(55, 65, 81); padding-left: 28px;"><li style="margin-bottom: 12px;"><span style="font-weight: 600;">Back off</span> exponentially, starting at 1 second.</li><li style="margin-bottom: 12px;">Batch writes where possible — see <a href="https://example.com/docs/batching" style="color: rgb(79, 70, 229); text-decoration: underline;">batching</a>.</li></ul><table style="border-collapse: collapse; font-size: 15px;"><thead><tr><th style="padding: 8px; background: #f9fafb;">Plan</th><th style="padding: 8px; background: #f9fafb;">Requests / min</th></tr></thead><tbody><tr><td style="padding: 8px;">Free</td><td style="padding: 8px;">60</td></tr><tr><td style="padding: 8px;">Pro</td><td style="padding: 8px;">600</td></tr><tr><td style="padding: 8px;">Enterprise</td><td style="padding: 8px;">Custom</td></tr></tbody></table>`;

const markdownNotes = `# Weekly Plan


• Workout
•    Build project
    ◦ Write the formatting tests
    ◦ Record the demo video
• Email    candidates


This is **important** and should stay bold.

Ship checklist: \`npm run check\` must pass before tagging a release.

[Read more](https://example.com)`;

const messyBullets = `Packing list for the offsite:${NBSP}${NBSP}

•Laptop + charger
•     HDMI adapter
▪   Spare clicker batteries
-   Printed agenda (20 copies)
	–  Name badges
	–  Lanyards

*   Snacks${ZWSP} for the afternoon session`;

const googleDocsHtml = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1f6c2a7e-7fff-1b2c-9d4e-3a5b6c7d8e9f"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#1a73e8;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Interview debrief</span></p><br><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:#fff2cc;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Candidate: Jordan Lee   ·   Role: Senior Designer</span></p><br><br><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Overall: </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">strong hire</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">. Portfolio review was the </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:italic;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">best we've seen this quarter</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">.</span></p><ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;" aria-level="1"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;white-space:pre-wrap;">Systems thinking: excellent</span></p></li><li dir="ltr" style="list-style-type:circle;font-size:11pt;font-family:Arial,sans-serif;color:#000000;" aria-level="2"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;white-space:pre-wrap;">Rebuilt a design system across 3 products</span></p></li><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;" aria-level="1"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;white-space:pre-wrap;">Collaboration: good, a little quiet in the panel</span></p></li></ul><br><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;white-space:pre-wrap;">Scorecard: </span><a href="https://example.com/scorecards/jordan-lee" style="text-decoration:none;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#1155cc;font-weight:400;text-decoration:underline;-webkit-text-decoration-skip:none;white-space:pre-wrap;">open in Greenhouse</span></a></p></b>`;

const spreadsheet = `Name\tRole\tStart date\tLocation
Ana Silva\tProduct Designer\t2026-11-03\tLisbon
Marcus Webb\tStaff Engineer\t2026-11-10\tToronto
Hana Sato\tData Analyst\t2026-11-17\tRemote`;

const blogHtml = `<meta charset="utf-8"><article style="font-family: charter, Georgia, serif; color: rgb(36, 36, 36);"><h1 style="font-size: 42px; line-height: 52px; font-weight: 700; letter-spacing: -0.016em;">The quiet cost of meetings</h1><div style="display: flex; gap: 12px;"><span style="font-size: 14px; color: rgb(107, 107, 107);">Elena Park</span><button style="border-radius: 99px; background: rgb(26, 137, 23); color: white;">Follow</button><span style="font-size: 14px; color: rgb(107, 107, 107);">· 6 min read</span></div><p style="font-size: 20px; line-height: 32px; letter-spacing: -0.003em;"><span style="float: left; font-size: 66px; line-height: 0.83;">E</span>very recurring meeting looks cheap on its own. Thirty minutes, six people, once a week.${NBSP}${NBSP}But the real cost is the <em>fragmented afternoon</em> it leaves behind.</p><blockquote style="border-left: 3px solid rgb(36,36,36); padding-left: 20px; font-style: italic; font-size: 20px;">Makers need uninterrupted blocks of at least half a day.</blockquote><p style="font-size: 20px; line-height: 32px;">Three changes that worked for us:</p><ol style="font-size: 20px; line-height: 32px;"><li><strong>Default to 25 minutes</strong>, not 30.</li><li>Cancel any meeting without a written agenda.</li><li>Protect two no-meeting afternoons per week.</li></ol><p style="font-size: 20px; line-height: 32px;">More in <a href="https://example.com/maker-schedule" style="color: inherit; text-decoration: underline;">Maker's Schedule, Manager's Schedule</a>.<span class="sr-only">Opens in a new window</span></p><div style="display:flex"><button>👏 1.2K</button><button>Share</button></div></article>`;

export const SAMPLES: Sample[] = [
  {
    id: 'chatgpt-gmail',
    from: 'ChatGPT',
    to: 'Gmail',
    destination: 'gmail',
    problem: 'AI answers are Markdown. Pasted into email, the ** and ## show up literally.',
    payload: { text: chatgptReply },
  },
  {
    id: 'pdf-docs',
    from: 'PDF',
    to: 'Google Docs',
    destination: 'google-docs',
    problem: 'PDF text keeps its hard line breaks and hyphenation, so every line becomes its own paragraph.',
    payload: { text: pdfExcerpt },
  },
  {
    id: 'website-slack',
    from: 'Website',
    to: 'Slack',
    destination: 'slack',
    problem: 'Web pages carry their fonts, sizes and background colours into the paste.',
    payload: { html: websiteHtml },
  },
  {
    id: 'markdown-docs',
    from: 'Markdown notes',
    to: 'Google Docs',
    destination: 'google-docs',
    problem: 'Notes apps export Markdown and ad-hoc bullets that rich editors show as raw symbols.',
    payload: { text: markdownNotes },
  },
  {
    id: 'bullets-plain',
    from: 'Messy bullets',
    to: 'Plain text',
    destination: 'plain',
    problem: 'Mixed bullet glyphs, tabs and invisible characters make lists look broken.',
    payload: { text: messyBullets },
  },
  {
    id: 'gdocs-rich',
    from: 'Google Docs',
    to: 'Rich text',
    destination: 'rich',
    problem: 'Docs exports every run with inline fonts, colours, highlights and stray <br>s.',
    payload: { html: googleDocsHtml },
  },
  {
    id: 'sheet-docs',
    from: 'Spreadsheet',
    to: 'Google Docs',
    destination: 'google-docs',
    problem: 'Copied cells arrive as tab-separated text that turns into a ragged mess in a document.',
    payload: { text: spreadsheet },
  },
  {
    id: 'blog-gmail',
    from: 'Blog post',
    to: 'Gmail',
    destination: 'gmail',
    problem: 'Articles bring 42px headings, drop caps, Follow buttons and hidden screen-reader text.',
    payload: { html: blogHtml },
  },
];
