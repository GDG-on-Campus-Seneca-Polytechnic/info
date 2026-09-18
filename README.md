# GDG on Campus @ Seneca Polytechnic

The home base for our chapter: who we are, how we run things, and a folder for every session we host.

New to the team? Read this page, then open [`sessions/`](sessions/) to see what is coming up.

## What is GDG on Campus?

GDG on Campus is a student community supported by Google, with chapters at universities and colleges around the world. Members learn Google technologies by building things with them and helping each other out.

Every chapter is student run. Google provides the program, the branding, and some resources. Students decide what events to hold and what to build.

Google Developer Student Clubs (GDSC) was renamed GDG on Campus in 2024. If you remember GDSC, it is the same program.

We are the **Seneca Polytechnic** chapter, based in Toronto.

## Find us

| Where | Link |
|---|---|
| All our links | [linktr.ee/senecagdg](https://linktr.ee/senecagdg) |
| Chapter page and event RSVPs | [gdg.community.dev](https://gdg.community.dev/gdg-on-campus-seneca-polytechnic-toronto-canada/) |
| Discord | [discord.gg/x5NYqqKyAf](https://discord.gg/x5NYqqKyAf) |
| Instagram | [@senecapolygdg](https://www.instagram.com/senecapolygdg) |
| LinkedIn | [senecapolygdg](https://www.linkedin.com/company/senecapolygdg/) |
| SSF club page | [clubs.ssfinc.ca/senecapolygdg](https://clubs.ssfinc.ca/senecapolygdg/) |

Events are free and open to any Seneca student. You do not need to be in a computing program.

## What we focus on

We run events across four tracks:

- **Web**: frontend, backend, and deploying real sites
- **Cloud**: Google Cloud, Firebase, and serverless
- **Machine learning and AI**: Gemini API, Google AI Studio, Colab, Kaggle
- **Mobile**: Android and Flutter

Event formats we use: info sessions, workshops, code jams, hackathons, and Cloud Study Jams.

## Free stuff for students

Step-by-step guides for claiming free tools as a student live in [`guides/`](guides/). Start with the [GitHub Student Developer Pack](guides/github-student-pack/).

## Get involved

You do not need to be on the core team to contribute. The team tracks its own tasks in Linear, so issues here are for public ideas and offers.

- **Have an idea for an event?** [Open an event idea](https://github.com/GDG-on-Campus-Seneca-Polytechnic/info/issues/new?template=event-idea.yml).
- **Want to teach something?** [Offer a talk or demo](https://github.com/GDG-on-Campus-Seneca-Polytechnic/info/issues/new?template=talk-proposal.yml). The best sessions come from people who just figured something out.
- **Spotted something wrong here?** [Report it](https://github.com/GDG-on-Campus-Seneca-Polytechnic/info/issues/new?template=fix-or-update.yml), or fix it yourself with a pull request.

## Core team

| Name | Role |
|---|---|
| Osman Kahraman | Chapter Lead |
| Thai Nguyen | Event Coordinator |
| Stephanie Chinaza | Event Coordinator |
| Lucas Krawczak | Tech Lead |
| Tan Dat Ta | Tech Lead |
| Betjoy Jacob | Marketing |

Update this table when the team changes. Roles open up every term.

## Repository layout

```
info/
├── README.md                          ← you are here
├── CONTRIBUTING.md                    ← how to add or update a session
├── .github/                           ← issue forms, PR template, automatic checks
├── guides/                            ← how to claim free student tools
│   └── github-student-pack/           ← one folder per guide: README.md + images/
├── scripts/
│   └── check-sessions.sh              ← checks folder names and required files
├── templates/
│   └── session/                       ← copy this folder to start a new session
│       ├── README.md
│       ├── deck.md
│       └── recap.md
└── sessions/
    ├── README.md                      ← index of every session
    └── 2026-fall/                     ← one folder per term
        └── 2026-09-23-info-session/   ← one folder per session: date, then name
            ├── README.md              ← details, run of show, checklist
            ├── deck.md                ← slide text and speaker notes
            ├── 2026-09-23-info-session.pptx
            └── recap.md               ← filled in after the event
```

### Naming rules

| What | Pattern | Example |
|---|---|---|
| Term folder | `YYYY-term` | `2026-fall`, `2027-winter`, `2027-summer` |
| Session folder | `YYYY-MM-DD-short-name` | `2026-10-14-code-jam` |
| Slides file | same name as the session folder | `2026-10-14-code-jam.pptx` |

Date first keeps sessions in order when sorted. Naming the slides after the folder means a downloaded file still says which event it belongs to.

## Starting a new session

```bash
cp -r templates/session sessions/2026-fall/2026-10-14-code-jam
```

Then fill in the new `README.md` and add a row to [`sessions/README.md`](sessions/README.md). Full steps are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Chapter rules to keep in mind

- **Stay active.** Google marks a chapter inactive if it goes too long without hosting an event, and removes it after 365 days with no event. Our internal target is at least one event every 90 days. Google's official text says 180 days, so 90 gives us a buffer.
- **Publish early.** Reactivating an inactive chapter takes 5 to 7 business days after an event is published, and the event is hidden from attendees until then.
- **SSF approval comes first.** SSF does not approve events during the first two weeks of a semester. Submit for approval before announcing a date.

## What does not go in this repo

This repository is for chapter information that is safe to share. Do not commit:

- Personal emails, phone numbers, or home addresses
- Staff or sponsor contact details
- Budget numbers, receipts, or payment details
- Links to private Drive folders with member photos
- Passwords, API keys, or tokens
- Build scripts or source files used to make slides. Commit the finished `.pptx` only.

Keep those in the team's private Drive or in Linear.
