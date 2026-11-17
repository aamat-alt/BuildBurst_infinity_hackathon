# Person 3 — AI flow & delivery

## Order of work (do not reorder)
1. `.env` + `node scripts/testPrompt.js` until it prints 3 projects / 12 tasks and all traps green
2. only then wire `POST /transcript`
3. only then hand the endpoint to the frontend person

## Files
| file | what it is |
|---|---|
| `src/ai/prompt.js` | the prompt. The thing judges actually grade. |
| `src/ai/directory.js` | team directory sent to the AI (no passwords) |
| `src/ai/extract.js` | Claude call + JSON parsing |
| `src/validation/validateDraft.js` | validates every field before any save |
| `src/routes/transcript.js` | POST /transcript, admin-only, one transaction |
| `scripts/testPrompt.js` | offline test vs the organizer answer key |
| `prisma/schema.prisma` | schema the route expects |

## Setup
```bash
npm i express express-session @prisma/client @anthropic-ai/sdk dotenv
npm i -D prisma
cp .env.example .env            # add ANTHROPIC_API_KEY + DATABASE_URL
npx prisma migrate dev --name init
```

Paste section 7 of the challenge PDF into `data/transcript.txt`, then:
```bash
node scripts/testPrompt.js --runs 3
```

## Answer key the harness checks
| project | mgr | deadline | tasks | hours |
|---|---|---|---|---|
| UrbanCart Website | Ayesha | 2026-10-20 | 4 | 40 |
| QuickServe Mobile App | Bilal | 2026-10-24 | 4 | 46 |
| HelpDeskPro AI Assistant | Hina | 2026-10-22 | 4 | 38 |

Traps: UrbanCart 20 Oct (not 18) · integration task 19 Oct (not 17) · QuickServe integration 10h (not 8) · HelpDeskPro testing = Maryam (not Zain) · Kamran never assigned · no payment/inventory/maps/email tasks.

## Changed-input test (judges will do this)
Copy `data/transcript.txt` to `data/transcript-modified.txt`, change QuickServe integration to 12 hours / 23 October, then:
```bash
node scripts/testPrompt.js --file data/transcript-modified.txt --no-key
```
That task must change; the other eleven must not.

## Contract for the frontend person
`POST /transcript` body: `{ "transcript": "..." }` (session cookie required)

- 201 `{ ok:true, message, projects:[{id,name,clientName,managerId,deadline,taskCount,totalHours}], warnings }`
- 400 empty/too-short transcript
- 401 not logged in · 403 not admin · 409 already processing (disable the button)
- 422 `{ ok:false, errors:[{path,field,message}] }` → render the list, nothing was saved
- 502 AI failed · 500 save failed → nothing saved in both cases
