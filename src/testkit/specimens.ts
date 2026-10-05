/**
 * Hard cases for real-world testing. Each specimen is a clipboard payload
 * that has broken a paste somewhere, with what Magic Paste should do with it
 * in a destination that has formatting and in a blank one.
 */

export interface Specimen {
  id: string;
  title: string;
  /** Where this kind of content comes from. */
  from: string;
  html?: string;
  text: string;
  /** What tends to go wrong with a normal paste. */
  watch: string;
  expect: { formatted: string; blank: string };
  /** Show the HTML as code instead of rendering it (hostile content). */
  codeOnly?: boolean;
}

const NBSP = String.fromCharCode(0xa0);
const ZWSP = String.fromCharCode(0x200b);

const aiAnswer = `## Plan for the Q4 offsite

Here's a **draft agenda** you can share with the team:

1. **Morning:** strategy review
   - Revenue vs. plan (*see dashboard*)
   - Top 3 risks for Q1
2. **Afternoon:** workshops
   - Hiring plan
   - Pricing experiment results

> Keep the strategy session to 90 minutes; energy drops after that.

| Session | Owner | Length |
| --- | --- | --- |
| Strategy | Priya | 90 min |
| Hiring | Marcus | 60 min |

Book the room at [the facilities portal](https://example.com/rooms) and run \`npm run agenda\` to regenerate the doc.`;

const article = `<meta charset="utf-8"><article style="font-family: Merriweather, Georgia, serif; color: rgb(41, 41, 41); max-width: 680px; margin: 0px auto;"><p style="font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: rgb(196, 30, 58);">Technology</p><h1 style="font-size: 44px; line-height: 1.1; font-weight: 800; margin: 8px 0px 16px;">Cities are quietly redesigning streets around delivery robots</h1><div style="display: flex; gap: 8px; font-family: Inter, sans-serif; font-size: 14px; color: rgb(117, 117, 117);"><span>By Amara Okafor</span><span>·</span><time>Oct 2, 2026</time><button style="margin-left: auto;">Share</button><button>Save</button></div><figure style="margin: 24px 0px;"><img src="https://picsum.photos/seed/street/680/360" alt="A delivery robot crossing a crosswalk" width="680" height="360"><figcaption style="font-size: 13px; color: rgb(117, 117, 117);">A delivery robot waits at a crossing in Tallinn. <span class="sr-only">Image credit:</span> Photo: Example Wire</figcaption></figure><p style="font-size: 20px; line-height: 1.7;">Pilot programs in <mark style="background-color: rgb(255, 241, 118);">eleven European cities</mark> have quietly changed curb design, adding ramps and painted lanes for six-wheeled couriers.${NBSP}${NBSP}Planners say the changes help wheelchair users too.</p><p style="font-size: 20px; line-height: 1.7;">“We started building for robots and ended up building for people,” said one engineer. <a href="https://example.com/study" style="color: rgb(196, 30, 58); text-decoration: underline;">Read the full study</a>.</p><aside style="border: 1px solid rgb(230, 230, 230); padding: 16px; font-family: Inter, sans-serif; font-size: 14px;"><strong>Sign up for our newsletter</strong> <input type="email" placeholder="you@example.com"> <button>Subscribe</button></aside></article>`;

const darkMode = `<meta charset="utf-8"><div style="background-color: rgb(17, 17, 17); color: rgb(235, 235, 235); font-family: -apple-system, sans-serif; padding: 24px;"><h2 style="color: rgb(255, 255, 255); font-size: 22px;">Release notes · v4.2</h2><p style="color: rgb(200, 200, 200); font-size: 15px;">This release makes sync <strong style="color: rgb(255, 255, 255);">3× faster</strong> and fixes the crash on resume.</p><ul style="color: rgb(220, 220, 220);"><li>New: offline mode for mobile</li><li>Fixed: duplicate notifications</li></ul><p style="font-size: 15px;">Upgrade with <code style="background: rgb(40, 40, 40); color: rgb(255, 198, 109); padding: 2px 6px; border-radius: 4px;">brew upgrade acme</code>.</p></div>`;

const docsSpan = (css: string, text: string) =>
  `<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;${css}">${text}</span>`;
const googleDocs =
  `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-a1b2c3d4-7fff-1234-5678-9abcdef01234">` +
  `<h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"><span style="font-size:16pt;font-family:Arial,sans-serif;color:#0b5394;font-weight:700;white-space:pre-wrap;">Project kickoff notes</span></h2>` +
  `<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${docsSpan('font-weight:400;', 'Decisions are ')}${docsSpan('font-weight:700;', 'final')}${docsSpan('font-weight:400;', ' unless flagged ')}${docsSpan('font-weight:400;background-color:#ffff00;', 'before Friday')}${docsSpan('font-weight:400;', '.')}</p><br>` +
  `<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;" aria-level="1"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${docsSpan('font-weight:400;', 'Scope')}</p></li>` +
  `<li dir="ltr" style="list-style-type:circle;font-size:11pt;font-family:Arial,sans-serif;" aria-level="2"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${docsSpan('font-weight:400;', 'MVP: import, edit, share')}</p></li>` +
  `<li dir="ltr" style="list-style-type:square;font-size:11pt;font-family:Arial,sans-serif;" aria-level="3"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${docsSpan('font-weight:400;font-style:italic;', 'Export is a stretch goal')}</p></li>` +
  `<li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;" aria-level="1"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${docsSpan('font-weight:400;', 'Timeline: see ')}<a href="https://example.com/timeline" style="text-decoration:none;">${docsSpan('color:#1155cc;text-decoration:underline;', 'the tracker')}</a></p></li></ul><br><br></b>`;

const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><style>p.MsoNormal{margin:0cm;font-size:11.0pt;font-family:"Calibri",sans-serif;}</style></head><body lang="EN-CA"><!--StartFragment--><p class="MsoNormal"><b><span style="font-size:14.0pt;color:#2F5496">Meeting minutes – 3 October<o:p></o:p></span></b></p><p class="MsoNormal"><o:p>&nbsp;</o:p></p><p class="MsoListParagraphCxSpFirst" style="text-indent:-18.0pt;mso-list:l0 level1 lfo1"><span style="font-family:Symbol">·<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>Budget approved<o:p></o:p></p><p class="MsoListParagraphCxSpMiddle" style="margin-left:72.0pt;text-indent:-18.0pt;mso-list:l0 level2 lfo1"><span style="font-family:'Courier New'">o<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;</span></span>Marketing: $40k<o:p></o:p></p><p class="MsoListParagraphCxSpLast" style="text-indent:-18.0pt;mso-list:l0 level1 lfo1"><span style="font-family:Symbol">·<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>Next review: <i>November</i><o:p></o:p></p><!--EndFragment--></body></html>`;

const pdf = `Annual Report 2025                                                     Page 4 of 38
Our operating margin improved to 18.4 percent, driven by lower fulfil-
ment costs and a shift toward higher-value subscriptions. Revenue grew
in every region except EMEA, where currency effects offset volume gains.
Highlights
•  Net revenue retention reached 112 percent, up from 104 percent.
•  Customer support response times fell by a third after the routing
   changes described in Section 5.
•  Headcount was flat year over year.
These results were achieved without increasing marketing spend.`;

const sheetHtml = `<meta charset="utf-8"><google-sheets-html-origin><style type="text/css">td {border: 1px solid #cccccc;}</style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none"><colgroup><col width="120"><col width="100"><col width="100"><col width="100"></colgroup><tbody><tr style="height:21px;"><td style="font-weight:bold;background-color:#d9ead3;">Region</td><td style="font-weight:bold;background-color:#d9ead3;">Q1</td><td style="font-weight:bold;background-color:#d9ead3;">Q2</td><td style="font-weight:bold;background-color:#d9ead3;">Change</td></tr><tr style="height:21px;"><td>North America</td><td style="text-align:right;">$1,204,000</td><td style="text-align:right;">$1,388,500</td><td style="text-align:right;color:#38761d;">+15.3%</td></tr><tr style="height:21px;"><td>EMEA</td><td style="text-align:right;">$842,300</td><td style="text-align:right;">$801,900</td><td style="text-align:right;color:#cc0000;">-4.8%</td></tr><tr style="height:21px;"><td>APAC</td><td style="text-align:right;">$515,000</td><td></td><td></td></tr></tbody></table></google-sheets-html-origin>`;
const sheetText = 'Region\tQ1\tQ2\tChange\nNorth America\t$1,204,000\t$1,388,500\t+15.3%\nEMEA\t$842,300\t$801,900\t-4.8%\nAPAC\t$515,000';

const nested = `Trip checklist
•Documents
    ◦  Passport (check expiry!)
    ◦  Visa printout
        ▪ Hotel confirmation number
•   Packing
    1)  Chargers
    2)  Adapters
        a) EU plug
        b) UK plug
–  Before leaving
–  Water the plants${ZWSP}
*   Lock the door`;

const vscode = `<meta charset="utf-8"><div style="color: #d4d4d4;background-color: #1e1e1e;font-family: Menlo, Monaco, 'Courier New', monospace;font-weight: normal;font-size: 12px;line-height: 18px;white-space: pre;"><div><span style="color: #c586c0;">export</span><span style="color: #d4d4d4;"> </span><span style="color: #569cd6;">async</span><span style="color: #d4d4d4;"> </span><span style="color: #569cd6;">function</span><span style="color: #d4d4d4;"> </span><span style="color: #dcdcaa;">retry</span><span style="color: #d4d4d4;">(</span><span style="color: #9cdcfe;">fn</span><span style="color: #d4d4d4;">, </span><span style="color: #9cdcfe;">attempts</span><span style="color: #d4d4d4;"> = </span><span style="color: #b5cea8;">3</span><span style="color: #d4d4d4;">) {</span></div><div><span style="color: #d4d4d4;">  </span><span style="color: #c586c0;">for</span><span style="color: #d4d4d4;"> (</span><span style="color: #569cd6;">let</span><span style="color: #d4d4d4;"> </span><span style="color: #9cdcfe;">i</span><span style="color: #d4d4d4;"> = </span><span style="color: #b5cea8;">0</span><span style="color: #d4d4d4;">; </span><span style="color: #9cdcfe;">i</span><span style="color: #d4d4d4;"> &lt; </span><span style="color: #9cdcfe;">attempts</span><span style="color: #d4d4d4;">; </span><span style="color: #9cdcfe;">i</span><span style="color: #d4d4d4;">++) {</span></div><div><span style="color: #d4d4d4;">    </span><span style="color: #c586c0;">try</span><span style="color: #d4d4d4;"> { </span><span style="color: #c586c0;">return</span><span style="color: #d4d4d4;"> </span><span style="color: #c586c0;">await</span><span style="color: #d4d4d4;"> </span><span style="color: #dcdcaa;">fn</span><span style="color: #d4d4d4;">(); } </span><span style="color: #c586c0;">catch</span><span style="color: #d4d4d4;"> { </span><span style="color: #6a9955;">/* wait and retry */</span><span style="color: #d4d4d4;"> }</span></div><div><span style="color: #d4d4d4;">  }</span></div><div><span style="color: #d4d4d4;">}</span></div></div>`;

const complexTable = `<meta charset="utf-8"><table style="border-collapse: collapse; font-family: Helvetica; font-size: 14px; width: 100%;" border="1"><thead><tr style="background: #f3f4f6;"><th rowspan="2">Plan</th><th colspan="2">Limits</th><th rowspan="2">Docs</th></tr><tr style="background: #f3f4f6;"><th>Requests/min</th><th>Storage</th></tr></thead><tbody><tr><td><b>Free</b></td><td>60</td><td>1 GB</td><td><a href="https://example.com/free">Free tier</a></td></tr><tr><td><b>Pro</b> <span style="background:#fde68a;font-size:11px;padding:2px 4px;border-radius:3px;">Popular</span></td><td>600</td><td>100 GB</td><td><a href="https://example.com/pro">Pro tier</a></td></tr><tr><td><b>Enterprise</b></td><td colspan="2" style="text-align:center;"><i>Custom</i></td><td></td></tr></tbody></table>`;

const email = `<meta charset="utf-8"><div dir="ltr" style="font-family: Verdana, sans-serif; font-size: 13px;">Hi Sam,<div><br></div><div>Attached is the revised proposal. The main change is in <b>section 3</b>.</div><div><br></div><div>Thanks,</div><div>Jordan</div><div><br></div><div>--<br><table cellpadding="0" cellspacing="0" style="font-family: Arial; font-size: 12px; color: #555;"><tbody><tr><td style="padding-right: 12px;"><img src="https://picsum.photos/seed/logo/60/60" width="60" height="60" alt="Acme logo"></td><td><b style="color: #111;">Jordan Lee</b><br>Head of Partnerships · Acme<br><a href="mailto:jordan@example.com">jordan@example.com</a> · <a href="tel:+16045550100">+1 604 555 0100</a></td></tr></tbody></table><img src="https://t.example.com/open.gif?id=8812" width="1" height="1" alt=""></div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Thu, Oct 2, 2026 at 9:14 AM Sam Ortiz &lt;sam@example.com&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin: 0px 0px 0px 0.8ex; border-left: 1px solid rgb(204, 204, 204); padding-left: 1ex;"><div dir="ltr">Can you send the latest version before Friday?</div></blockquote></div></div>`;

const international = `<meta charset="utf-8"><p style="font-family: system-ui;">Café crème · naïve · Smörgåsbord · Zürich · São Paulo · Dvořák</p><p>Emoji: 🚀 ✅ 👩🏽‍💻 🇨🇦 — and “smart quotes”, ‘single’, an em dash — an en dash – and an ellipsis…</p><p dir="rtl" lang="ar">مرحبا بالعالم — هذا نص عربي.</p><p dir="rtl" lang="he">שלום עולם — טקסט בעברית.</p><p lang="zh">你好，世界。这是中文文本。</p><p lang="ja">こんにちは世界。日本語のテキストです。</p><p>Math: 2² + 3³ = 35 · ½ · π ≈ 3.14159 · ±5% · ≤ ≥ ≠ · ©®™ · €45 £30 ¥500</p><p>Invisible: soft${String.fromCharCode(0xad)}hyphen, zero${ZWSP}width, non${NBSP}breaking.</p>`;
const internationalText = 'Café crème · naïve · Smörgåsbord · Zürich · São Paulo · Dvořák\nEmoji: 🚀 ✅ 👩🏽‍💻 🇨🇦 — and “smart quotes”, ‘single’, an em dash — an en dash – and an ellipsis…\nمرحبا بالعالم — هذا نص عربي.\nשלום עולם — טקסט בעברית.\n你好，世界。这是中文文本。\nこんにちは世界。日本語のテキストです。\nMath: 2² + 3³ = 35 · ½ · π ≈ 3.14159 · ±5% · ≤ ≥ ≠ · ©®™ · €45 £30 ¥500';

const hostile = `<meta charset="utf-8"><p>Totally normal text<script>alert('xss')</script></p><img src="x" onerror="alert('img')"><p><a href="javascript:alert('link')">Click me</a> · <a href="data:text/html,<script>alert(1)</script>">Data link</a> · <a href="https://example.com/safe" onclick="steal()">Safe link</a></p><iframe src="https://evil.example"></iframe><style>body{display:none}</style><form action="https://evil.example"><input name="password" value="hunter2"><button>Submit</button></form><p style="background:url(javascript:alert(2))">Background trick</p><svg onload="alert('svg')"><text>SVG</text></svg>`;

const resumeSection = `<meta charset="utf-8"><div style="font-family: 'Times New Roman', serif; font-size: 15px; color: #000;"><p style="margin:0;color:#2f4b8c;font-size:17px;font-weight:700;">PROFESSIONAL EXPERIENCE</p><p style="margin:2px 0 0;"><b>Harbor &amp; Pine,</b> <i>Operations Coordinator</i>&nbsp;&nbsp;&nbsp;&nbsp;<i>Mar 2021 - Jun 2023</i></p><ul style="margin:0;"><li>Coordinated weekly inventory counts across three warehouse locations</li><li>Trained six new support staff on the returns process</li></ul></div>`;

const big = Array.from({ length: 5000 }, (_, i) =>
  i % 50 === 0 ? `## Section ${i / 50 + 1}` : i % 7 === 0 ? `•   Item ${i} with  extra   spaces` : `Line ${i}: the quick brown fox jumps over the lazy dog.`,
).join('\n');

export const SPECIMENS: Specimen[] = [
  {
    id: 'ai-answer',
    title: 'AI chat answer',
    from: 'ChatGPT, Claude, Gemini (copy button)',
    text: aiAnswer,
    watch: 'Markdown symbols (**, ##, |, `) showing up literally; nested lists flattening; the table becoming pipes.',
    expect: {
      formatted: 'Real bold, headings, nested numbered + bullet list, a quote, a table and a link, in the document’s own fonts. Text fields keep it as tidy Markdown.',
      blank: 'Same structure. There are no source fonts to keep, so it uses the destination’s defaults.',
    },
  },
  {
    id: 'article',
    title: 'Styled news article',
    from: 'Medium, news sites, blogs',
    html: article,
    text: 'Technology\nCities are quietly redesigning streets around delivery robots\nBy Amara Okafor · Oct 2, 2026 Share Save\nA delivery robot waits at a crossing in Tallinn. Image credit: Photo: Example Wire\nPilot programs in eleven European cities have quietly changed curb design…',
    watch: 'Huge 44px headline, red kicker text, yellow highlight, Share/Save/Subscribe buttons and the email box coming along, hidden “Image credit:” text appearing.',
    expect: {
      formatted: 'Headline, byline (“By Amara Okafor · Oct 2, 2026”), image, caption, paragraphs and link in the document’s style. No buttons, form, hidden text or highlight; the newsletter line stays as bold text.',
      blank: 'Keeps Merriweather, the sizes (including the big headline) and the red kicker. Buttons, form, hidden text and highlight are gone.',
    },
  },
  {
    id: 'dark-mode',
    title: 'Dark-mode page',
    from: 'GitHub, docs sites, apps in dark mode',
    html: darkMode,
    text: 'Release notes · v4.2\nThis release makes sync 3× faster and fixes the crash on resume.\nNew: offline mode for mobile\nFixed: duplicate notifications\nUpgrade with brew upgrade acme.',
    watch: 'White or light-grey text pasting onto a white page and becoming invisible; a black box behind everything.',
    expect: {
      formatted: 'Readable dark text in the document’s style, a real list, inline code.',
      blank: 'Same: the light text colours are dropped (they’d vanish on white), no black background. The toast reports the fix.',
    },
  },
  {
    id: 'google-docs',
    title: 'Google Docs export',
    from: 'Copying out of a Google Doc',
    html: googleDocs,
    text: 'Project kickoff notes\nDecisions are final unless flagged before Friday.\nScope\nMVP: import, edit, share\nExport is a stretch goal\nTimeline: see the tracker',
    watch: 'Everything bold (Docs wraps content in <b>), three-level list flattened, yellow highlight, stray blank lines.',
    expect: {
      formatted: 'Heading, one bold word, three-level nested list, italic, link. No highlight, no extra blank lines.',
      blank: 'Keeps Arial and the blue heading colour, same structure, no highlight.',
    },
  },
  {
    id: 'word',
    title: 'Microsoft Word export',
    from: 'Word, Outlook desktop',
    html: word,
    text: 'Meeting minutes – 3 October\n\n·      Budget approved\no   Marketing: $40k\n·      Next review: November',
    watch: '“·” and “o” bullet characters as text, the list not being a list, hidden Office markup, blank paragraph.',
    expect: {
      formatted: 'A bold title, then a real two-level list (Budget approved › Marketing: $40k, Next review).',
      blank: 'Same, with the blue 14pt title kept.',
    },
  },
  {
    id: 'pdf',
    title: 'PDF text',
    from: 'Any PDF viewer',
    text: pdf,
    watch: 'Every line becoming its own paragraph, words split as “fulfil- ment”, bullets as text, the running header.',
    expect: {
      formatted: 'The “Page 4 of 38” header is gone, whole paragraphs, “fulfilment” rejoined, a real bulleted list (the wrapped bullet rejoined), “Highlights” on its own line.',
      blank: 'Same (plain text has no source look to keep).',
    },
  },
  {
    id: 'spreadsheet',
    title: 'Spreadsheet range',
    from: 'Google Sheets, Excel',
    html: sheetHtml,
    text: sheetText,
    watch: 'Green header fill and red/green text; fixed column widths; an empty trailing row; ragged text in plain fields.',
    expect: {
      formatted: 'A clean table with a bold header row, empty cells kept. Slack gets aligned text; text fields get tab-separated rows.',
      blank: 'A table that keeps Arial 10pt and the red/green change colours, without the green header fill.',
    },
  },
  {
    id: 'nested-lists',
    title: 'Messy nested lists',
    from: 'Notes apps, emails, hand-typed lists',
    text: nested,
    watch: 'Five different bullet styles, numbered and lettered sub-items, dash items, an invisible character.',
    expect: {
      formatted: 'A nested list: Documents › Passport, Visa › Hotel; Packing › 1. Chargers, 2. Adapters › EU plug, UK plug; then Before leaving, Water the plants, Lock the door. Lettered items become numbered.',
      blank: 'Same (there’s no source look to keep in plain text).',
    },
  },
  {
    id: 'code',
    title: 'Code from VS Code',
    from: 'VS Code, JetBrains, terminals',
    html: vscode,
    text: 'export async function retry(fn, attempts = 3) {\n  for (let i = 0; i < attempts; i++) {\n    try { return await fn(); } catch { /* wait and retry */ }\n  }\n}',
    watch: 'Indentation collapsing, a dark box, every token a different colour, lines merging into one paragraph.',
    expect: {
      formatted: 'One code block with the indentation intact. Text fields get the code as plain text.',
      blank: 'Same code block; the dark theme isn’t carried.',
    },
  },
  {
    id: 'complex-table',
    title: 'Table with merged cells',
    from: 'Pricing pages, docs, wikis',
    html: complexTable,
    text: 'Plan\tLimits\t\tDocs\n\tRequests/min\tStorage\t\nFree\t60\t1 GB\tFree tier\nPro Popular\t600\t100 GB\tPro tier\nEnterprise\tCustom\t\t',
    watch: 'Merged header cells, a “Popular” badge, links inside cells.',
    expect: {
      formatted: 'A table whose columns still line up: merged cells are spread across blank cells. Bold plan names, working links.',
      blank: 'Same, keeping Helvetica.',
    },
  },
  {
    id: 'email',
    title: 'Email with signature and reply',
    from: 'Gmail, Outlook',
    html: email,
    text: 'Hi Sam,\n\nAttached is the revised proposal. The main change is in section 3.\n\nThanks,\nJordan\n\n--\nJordan Lee\nHead of Partnerships · Acme\njordan@example.com · +1 604 555 0100\n\nOn Thu, Oct 2, 2026 at 9:14 AM Sam Ortiz <sam@example.com> wrote:\nCan you send the latest version before Friday?',
    watch: 'Signature layout table, logo, a hidden 1×1 tracking pixel, the quoted reply.',
    expect: {
      formatted: 'Paragraphs, the signature as plain lines with working email/phone links, the logo, the quote as a quote. No tracking pixel.',
      blank: 'Same, keeping Verdana.',
    },
  },
  {
    id: 'international',
    title: 'Languages, emoji and symbols',
    from: 'Anywhere',
    html: international,
    text: internationalText,
    watch: 'Garbled characters, emoji splitting (👩🏽‍💻 is several characters), right-to-left text flipping, invisible characters.',
    expect: {
      formatted: 'Every character exactly as shown, emoji intact. The soft hyphen and zero-width space are removed (the toast reports them).',
      blank: 'Same.',
    },
  },
  {
    id: 'hostile',
    title: 'Hostile HTML',
    from: 'Malicious or broken pages',
    html: hostile,
    text: 'Totally normal text\nClick me · Data link · Safe link\nBackground trick\nSVG',
    watch: 'Any popup or alert, a script running, a form or password field appearing, links that run code.',
    expect: {
      formatted: 'Only text: “Totally normal text”, three link texts (only “Safe link” clickable), “Background trick”. No alert, form, frame or image.',
      blank: 'Same.',
    },
    codeOnly: true,
  },
  {
    id: 'huge',
    title: 'Huge paste (5,000 lines)',
    from: 'Logs, exports, long documents',
    text: big,
    watch: 'The page freezing; the paste taking seconds.',
    expect: {
      formatted: 'Pastes within about a second, with 100 headings and tidied bullets. (Over 1 MB, Magic Paste steps aside on purpose.)',
      blank: 'Same.',
    },
  },
  {
    id: 'tiny',
    title: 'Tiny pastes',
    from: 'Everyday copying',
    text: 'https://example.com/a-very-long-link?utm_source=newsletter',
    watch: 'Magic Paste getting in the way of simple pastes.',
    expect: {
      formatted: 'Pastes exactly as copied. Expect a “Pasted normally: already clean” card. Also try a single word.',
      blank: 'Same.',
    },
  },
  {
    id: 'resume',
    title: 'Resume section (styled)',
    from: 'A resume template in a document',
    html: resumeSection,
    text: 'PROFESSIONAL EXPERIENCE\nHarbor & Pine, Operations Coordinator    Mar 2021 - Jun 2023\nCoordinated weekly inventory counts across three warehouse locations\nTrained six new support staff on the returns process',
    watch: 'Into your own resume: does it take on your resume’s style? Into a blank doc: does it keep the blue heading and Times New Roman?',
    expect: {
      formatted: 'Takes on the destination’s style (in Google Docs, after Magic Paste has learned that document’s design).',
      blank: 'Keeps Times New Roman, the blue all-caps heading, bold company and italic title.',
    },
  },
];

export const DESTINATIONS = ['Google Docs (formatted)', 'Google Docs (blank)', 'Gmail', 'Slack', 'Notion', 'Text field'];
