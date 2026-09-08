# Atlas — 3 Minute Demo

A walkthrough for showing Atlas to a potential user, investor, or customer.

**Quoted text is what you say out loud.** The notes underneath tell you what will actually appear on screen, so nothing surprises you live.

---

## Before you start — 5 minute pre-flight

Run through this once, an hour before. Do not skip it.

- [ ] `npm run dev` is running and `localhost:3000` loads
- [ ] You have a **fresh** email ready to sign up with — the onboarding flow only shows once per account
- [ ] **Sign in once beforehand on a second account**, send two or three messages, and add a task. A dashboard with real data on it demos far better than an empty one. Sign out afterwards.
- [ ] Have a real job description copied to your clipboard for the jobs section
- [ ] Close every other tab. Full screen. Zoom to 110% so people can read it.
- [ ] Wifi tested — every response needs a live API call

**Know your two honest answers.** Someone will ask. Have these ready:

> "Ten of the twenty agents are live today. The other ten need integrations I haven't built yet — and Atlas tells you which is which, instead of pretending. That's deliberate."

> "It never sends an email or books anything without showing you exactly what it's about to do first. You approve, then it acts."

---

## 0:00 — 0:30 · The landing page

**Open `localhost:3000/wow.html`.** Scroll slowly through one or two scenes.

> "Everyone's drowning in admin. Email, calendar, invoices, job applications, expenses — all in different places, all needing you.
>
> Atlas is one assistant that handles all of it. You talk to it like a person. It does the rest."

Scroll to pricing.

> "£299 a month for Pro, £499 for Elite. That's not a productivity app price. It's an assistant price — because that's what it replaces."

Click **Try Atlas Free**.

---

## 0:30 — 1:00 · Sign up and onboarding

Sign up with your fresh email. You land straight in onboarding.

> "Watch this bit. It's five questions."

Move through them quickly — name, what you do, what to handle first, city, biggest challenge.

For the last one, type something real and specific:

```
I'm applying for AI roles but my applications aren't landing interviews
```

> "Those five answers aren't a form. Every one becomes permanent memory. Atlas will still know this about me in six months — and it shapes every answer it gives me from here."

Land on the dashboard.

---

## 1:00 — 2:00 · The chat

Click **Chat**. Send these three, one at a time. Read the response out loud while the next one types.

### Message 1 — honesty

```
I have an interview at Google on Thursday at 2pm, help me prepare and add it to my calendar
```

**What happens:** you get solid interview prep, plus a clear statement about the calendar.

- **If Google isn't connected:** Atlas says it can't add the event and offers to help you connect it.
- **If Google is connected:** Atlas still won't silently create the event — the calendar requires your approval first.

Either way, lean into it:

> "Notice what it just did. It helped with the prep — and it told me straight that it can't put that in my calendar yet.
>
> Every AI assistant you've tried would have said 'Done, added to your calendar!' and added nothing. That's the whole problem with this category. Atlas doesn't do that. If it says it did something, it did it."

### Message 2 — the one that lands

```
I spent £85 at Waitrose yesterday and need to invoice my client Sarah at Creative Agency £2,500 for the logo project
```

**What happens:** while it replies, Atlas silently writes three records — the £85 expense, Sarah as a contact at Creative Agency, and a task. It'll offer to raise the invoice.

> "One sentence. No forms, no buttons, no categories to pick.
>
> It logged the expense, saved Sarah as a client with her company, and it's ready to raise the invoice. I'll show you in a second that all of that is actually saved — not just described back to me."

### Message 3 — the work product

```
Find me the latest news on AI agents and write a LinkedIn post about it
```

**What happens:** you get a genuinely good LinkedIn post. Atlas will be honest about how current its information is, and will note it can't publish to LinkedIn.

> "That's a publishable post in about eight seconds. And again — it's clear about what it can't do. It wrote the post; it's not going to claim it published it."

---

## 2:00 — 2:25 · The dashboard

Click **Dashboard**.

> "This is where it all lives."

Point at things as you say them — briefing, then stats, then the panel.

> "Morning briefing, generated from my actual tasks and invoices — not a template.
>
> There's the £85. There's Sarah. I never filled in a form. I just talked.
>
> And this panel is the part I'm proudest of: every agent, green if it's live, grey if it isn't. Nobody ships this. It's the honest version of an AI product."

Type into **Quick Ask Atlas** at the bottom:

```
What do you know about me so far?
```

> "It remembers. That compounds — it gets more useful every day you use it."

---

## 2:25 — 2:50 · The jobs page

Click **Jobs**.

> "This is where it earns the subscription."

Paste your job description into **Generate Application Package**, add a job title and company, and click generate.

> "Tailored CV, cover letter, and a fit score with my actual gaps against that specific role.
>
> Someone applying for twenty jobs a month is spending a full weekend on this. That's the £299."

While it generates, point at the tracker:

> "And every application tracked here — applied, interview, offer, rejected."

---

## 2:50 — 3:00 · Close

> "Ten agents live today, ten more coming — email, calendar, invoicing, job applications, memory, all working now.
>
> It's £299 a month, and it's in private beta. I'm taking a small number of early users."

Then stop talking and ask:

> "Want me to put you on the list?"

---

## Handling the three questions you'll get

**"How is this different from ChatGPT?"**

> "ChatGPT forgets you the moment you close the tab. Atlas remembers everything permanently, and it writes to real systems — your calendar, your invoices, your expenses. It's the difference between someone who gives advice and someone who does the work."

**"What if it gets something wrong?"**

> "It never sends or books anything without showing you first — you approve every outbound action. And it's built to say 'I can't do that' rather than inventing a result. That's why I'd trust it with an invoice."

**"Is it actually working, or is this a mockup?"**

Reload the dashboard in front of them. The £85 and Sarah are still there.

> "Real database, real account. Sign up yourself right now if you like."

---

## If something breaks mid-demo

**A response is slow** — keep talking. *"It's calling a live model — this is real, not a canned demo."*

**An agent says it's not connected** — that's the product working. *"That's exactly the honesty I was describing."*

**Something genuinely errors** — do not fake it. Move to the dashboard, which loads from the database and always has your data.

> "Beta. That one's on my list for this week."

Investors expect bugs in a beta. They don't forgive being misled — and neither do customers, which is the entire reason Atlas is built the way it is.
