McMaster Forge Incubator Application — Fabriq Answers

Status: Draft v1 (in refinement)
Deadline: March 29, 2026
Last Updated: 2026-03-28


Q1: Company Name
A1: Fabriq


Q2: Your Name
A2: Prasanna Jaganathan (Co-founder & Technical Lead)


Q3: Email
A3: [To be provided]


Q4: Phone
A4: [To be provided]


Q5: Problem
A5: Finance teams don't just have a time problem — they have an intelligence problem. Today's accounting tools (QuickBooks, Xero) are static: they apply the same rules to every company. When a finance team needs a custom workflow (bank reconciliation with their specific matching rules, collections triage based on customer risk, dunning with approval chains), they face a dead end: either live with a broken process or rely on a human expert.

Finance workflows are pattern-based and learnable. A reconciliation matching rule — "if posting amount matches invoice amount and dates are within 3 days, it's likely the same transaction" — is something an AI agent should learn autonomously, get better at with feedback, and adapt when the pattern changes (e.g., new payment processor with different timing). But no tool today does this. Competitors like Ramp, Rillet, and Kick are building agentic AI, but they're vertical (AP automation, ERP, bookkeeping only). There's no configurable agentic platform for SMBs that need reconciliation + payables + collections + custom workflows.

The cost: 20-50 hours/month in manual reconciliation that an autonomous agent could handle. But more importantly: finance teams can't optimize their workflow because they're handcuffed to tools that won't adapt.


Q6: Solution
A6: Fabriq is an AI Native financial agent platform. Instead of hardcoding workflows in code, finance teams define their goals — "reconcile my HDFC account," "match invoices to payments," "triage collections" — and Fabriq deploys autonomous agents to execute them.

How agents work:
1. Plan: The agent decomposes the goal into steps (query unmatched postings → analyze matching patterns → suggest matches → queue for review)
2. Execute: The agent intelligently executes each step using real-time data and learned patterns
3. Suggest: The agent surfaces high-confidence matches for instant approval and uncertain matches for human review
4. Learn: When humans approve/reject suggestions, the agent learns which matching rules work, which need override, which edge cases require judgment
5. Adapt: Agents continuously refine their logic and adapt to workflow changes

The agent autonomously finds unmatched bank transactions, suggests matches to invoices/receipts using learned matching logic, and queues matches for human review. High-confidence matches (e.g., 95%+ exact amount + date match) auto-approve; uncertain ones route to humans for judgment. This shrinks month-end close from days to hours while keeping humans in control.

Key difference from incumbents: QuickBooks and Xero are the default for SMBs but largely static — same rules for every company, limited room for custom reconciliation or approval chains without bolt-ons. NetSuite and similar ERPs are powerful but costly, slow to implement, and still leave finance teams doing heavy manual matching. Fabriq agents are configurable for any financial workflow — reconciliation, payables, collections, custom rules — without custom code. Finance teams define the workflow once, agents run autonomously, humans focus on judgment.


Q7: Value Proposition
A7: Fabriq runs the mechanical side of finance for you—matching transactions, categorizing spend, and triaging what needs attention—so people on the finance team spend their time on decisions, not grunt work. The same autonomous agents adapt to how you operate: bank reconciliation, payables, collections, or any financial workflow you care about, without locking you into a single vertical tool. The outcome we aim for is a steep drop in hours spent on reconciliation (on the order of 80%), accuracy around 99%, and agents that keep getting better as your business evolves.


Q8: Target Market
A8: Finance and accounting teams at small businesses ($5M-100M revenue) in North America—primarily US and Canada. They've outgrown QuickBooks/Xero but can't justify $100K+ ERPs. Their pain points: manual reconciliation (bank, AP, AR), high error rates, month-end close delays, tool fragmentation, and inability to automate custom workflows. Current customers in conversations: staffing/recruitment agencies, small manufacturing, professional services, and e-commerce. These verticals have complex multi-account reconciliation, high transaction volumes, and variable approval workflows—exactly what Fabriq solves.


Q9: Market Size
A9:
- TAM (Total Addressable Market): ~$18B. 5.6M small businesses in North America with finance/accounting needs. Average accounting software spend: $3K-5K/year per company.
- SAM (Serviceable Addressable Market): ~$2B. 200K+ SMBs ($5M-100M revenue) actively looking for better accounting solutions beyond QuickBooks/Xero. Average spend per customer: $10K/year (usage-based model).
- SOM (Serviceable Obtainable Market): $50M+ in Year 3-5. Conservative 5K customers at $10K ARR each. Aggressive path: 10K customers = $100M+.

(Sources: US Census Bureau, Bureau of Labor Statistics, SMB accounting software benchmarks.)


Q10: Validation
A10: We've validated the problem through 5-6 early-stage customer conversations with accounting teams in staffing and e-commerce verticals. Feedback: "Month-end close is killing us," "We can't customize our tools," "We juggle 4 spreadsheets and 3 apps." We built a working MVP focusing on the #1 pain point: bank reconciliation. We've also reviewed competitive products (QuickBooks, Xero, SAP, NetSuite, custom dev shops) and confirmed there's no middle ground for configurable automation. The metadata-driven architecture is validated by Prasanna's 20+ year track record: Kissflow (no-code platform, early Google App Engine adopter), Crayon Data (VP engineering, built configurable data product for Fortune 500s). We're now iterating product based on pilot feedback before broader go-to-market.


Q11: Business Model
A11: Usage-based / outcome-based pricing. We charge based on value delivered: per-transaction reconciled, per-account automated, or per-month of active automation. This aligns incentives—we win when the customer automates more and saves more time. Pricing is transparent and scales with their growth. Example: $500/month base + $0.05 per transaction reconciled. This contrasts with per-user SaaS (discourages adoption) or fixed licensing (ignores usage). As the FinTech world shifts to outcome-based models, this positions us with modern buyer expectations and reduces buyer resistance at proof-of-concept.


Q12: Go-to-Market
A12:
- Phase 1 (Months 1-6): Validation. Close 2-3 paying pilots with hand-picked customers from our network. Focus on bank reconciliation (highest ROI, tightest workflow, easiest to measure impact). Build case studies.
- Phase 2 (Months 6-12): Expand playbook. Productize the reconciliation workflow. Expand to 1-2 new verticals.
- Phase 3 (Year 2): Expand feature set. Add payables automation, AR, multi-account workflows. Target: reach 20-50 paying customers.

Channel strategy: (1) direct sales to SMB finance teams via content (finance blog, LinkedIn, industry forums); (2) partnerships with accounting firms and bookkeeping services (resale, referral); (3) vertical partnerships (staffing platforms, e-commerce marketplaces).


Q13: Competitive Analysis
A13:
- QuickBooks / Xero: Dominate SMB accounting but are static tools. They can't adapt to custom workflows or learn from your data. $35-235/month, limited customization.
- Agentic competitors emerging (Ramp, Rillet, Kick): These are moving to autonomous AI agents — which is the right direction. Ramp (AP automation, $50K+ deployment), Rillet (AI-native ERP, $10K+/month), Kick (bookkeeping-only). Problem: they're vertical and rigid. Ramp does AP well but can't do reconciliation or collections. Rillet is an ERP, not an agent platform. Kick is bookkeeping-only. Fabriq is horizontal and configurable — same agentic intelligence, any workflow.
- NetSuite / SAP: Highly configurable but enterprise-focused, $100K+ implementation, 6-18 month sales cycles.
- Custom dev shops: Build what you need but $20-50K per project, slow to change, hard to maintain.

Fabriq's edge:
1. Agentic first — autonomous agents plan, execute, and learn. Not rule-based automation
2. Configurable — no custom code. Define your workflow, agents run it
3. Horizontal — works for reconciliation, payables, collections, custom workflows. Not locked into one domain
4. Human-in-the-loop — agents suggest, humans approve. Agents learn from feedback
5. Pricing aligns with value — usage-based, not per-seat

We're not trying to replace QuickBooks. We're the autonomous agent layer that makes any financial workflow adaptable without code.


Q14: Intellectual Property
A14:
Core IP: The metadata-driven architecture that auto-generates REST APIs, GraphQL, web UIs, and workflows from a single schema definition. This is patent-adjacent (Prasanna holds a 2011 US patent on hierarchical datamodel definition).

What we own:
1. The data schema language (optimized for financial workflows)
2. The auto-code-generation engine (Prisma-based)
3. The AI agent system for intelligent reconciliation matching
4. The workbench UI for human-in-the-loop approval

Trade secrets: Reconciliation matching algorithms (learned from 20+ years of financial product work).

Strategy: We're open to partnership but the metadata-driven approach is core to our defensibility. As customers depend on Fabriq to define their workflows, switching costs are high—not from lock-in, but from value. We'll also build a strong ecosystem (app marketplace, integrations) that gets stronger as we grow.


Q15: Stage
A15: MVP with early customer validation. We have a working prototype with functional bank reconciliation, basic approval workflows, and REST/GraphQL APIs. We're in early conversations with 5-6 SMBs (staffing, e-commerce). Not yet in market with revenue, but far enough along that we're collecting feedback and refining product-market fit rather than validating the problem.


Q16: State of the Product
Current state: Working MVP with autonomous reconciliation agent, human-in-the-loop workbench, and multi-tenant architecture. Built on Node.js/Express + React + Prisma, deployed on GCP.

What's working:
- Autonomous agent: Plans multi-step reconciliation workflows (query unmatched → analyze patterns → suggest matches)
- Smart matching: AI suggests matches between bank transactions and invoices; learns from human approvals
- Workbench UI: Humans review agent suggestions, approve high-confidence matches, provide feedback on uncertain ones. Agent learns from approvals and adapts
- Human-in-the-loop: Supervised mode (all matches reviewed), semi-auto (high-confidence auto-execute), autonomous (for future)
- Multi-tenant infrastructure: Session-aware planning, pending action queuing, approval tracking, accumulated context
- REST and GraphQL APIs: Full CRUD for integrations

What's not yet: Advanced agents (dunning, collections triage, payables), white-label version, Zapier/Make integrations, comprehensive audit trails, SSE real-time events.

Next focus: Hardening reconciliation agent based on pilot feedback, expanding to 2-3 new workflows (payables, collections), building integrations with accounting systems.

Quality: Production-grade code (TypeScript, PostgreSQL, tested). The agent architecture is proven via real E2E tests with the LLM. Not a prototype—this is infrastructure ready for pilot customers.


Q17: Company Website
A17: N/A (site in progress)


Q18: Pitch Deck
A18: [To be submitted as PDF]


Q19: Funding
A19: No outside funding to date. Fabriq is bootstrapped. Prasanna is self-funded via consulting (Fabriq Labs). This aligns our incentives with customers—we're building what users actually want, not what VCs want to hear. We're open to Forge's network for future funding conversations, but currently not raising.


Q20: Revenue
A20: $0 to date. We're pre-revenue (very early stage). 5-6 customer conversations in flight, targeting pilot agreements within 90 days. Usage-based model means revenue scales with customer traction—conservative first-year target is $50-100K MRR with 10-15 pilot customers.


Q21: Other Incubators/Accelerators
A21: No other incubators or accelerators. Forge is our first formal program.


Q22: Team
A22:

Prasanna Jaganathan (Co-founder, Technical Lead): 20+ years building metadata-driven platforms and financial products. MS VLSI Design (USC), BS Electrical Engineering (PSG). Patents in hierarchical datamodel definition. Held leadership roles: VP Engineering at Crayon Data (built maya.ai, a configurable data product used by Fortune 500s), Co-founder & Head of Engineering at AirLoyal (Android app with 13M users, 1.5M transactions/month), Director of Engineering at Kissflow/Orangescape (no-code platform, early Google App Engine adopter). Expert in cloud architecture (Snowflake, AWS, GCP), data engineering (Spark, Redshift), and building teams. Full-time on Fabriq.

Anusha Srinivasan (Co-founder, Business Lead): Senior Product Manager at Amazon (Sep 2023–present), leading inbound shipment experience for 1.5M+ sellers. PGDM in Marketing & Strategy from IIM Ahmedabad (India's top MBA). 8+ years in operations, product, and business strategy. Prior roles: Senior Program Manager at Amazon (platform migration for 1.5M sellers), Business Head at CaratLane (jewelry e-commerce, managed P&L), and consulting. Deep expertise in scaling operations, customer insights, and strategic execution. Transitioning to full-time on Fabriq.

Why this team works: Prasanna brings 20 years of platform-building and financial product expertise. Anusha brings product management at scale, e-commerce operations, and go-to-market experience. Together: technical depth + business execution.


Q23: Why The Forge?
A23:

Forge is the right partner for Fabriq at this stage.

(1) FinTech expertise: Forge has backed financial software companies and understands the domain (compliance, security, customer requirements). We're building financial infrastructure—not a mobile app or consumer SaaS—and Forge gets that.

(2) Customer network: We need pilot customers fast. Forge's connections to SMB finance teams, accounting firms, and business leaders in Ontario/Canada are invaluable.

(3) Mentorship: We need guidance on GTM (how to position against QuickBooks, how to land pilot customers), fundraising strategy (when, how much, who to target), and navigating financial/compliance requirements.

(4) Community: Forge attracts founders solving hard infrastructure problems. Learning from peers in that cohort is valuable.

(5) Credibility: Forge's brand opens doors—customer conversations, investor conversations, partnership talks. We're bootstrapped and building in stealth; Forge's stamp of approval accelerates all of that.

We're not looking for funding (yet) or just a nice co-working space. We need mentorship, intros, and the network to de-risk our GTM.


Q24: Location
A24: Yes. Prasanna is based in Toronto, Ontario. Anusha is based in the GTA. Both within 30 minutes of Forge.


Q25: Employment Status
A25:
- Prasanna: Self-employed / Independent Consultant. Founder of Fabriq Labs (consulting in revenue intelligence). Full-time commitment to Fabriq.
- Anusha: Employed full-time at Amazon as Senior Product Manager. Transitioning to full-time on Fabriq.


Q26: Employment Status Continued
A26: Prasanna is wrapping up consulting commitments (month-to-month clients, no long-term contracts). He is already 100% focused on Fabriq. Anusha is planning her transition from Amazon; likely 60% Fabriq, 40% Amazon for 2-3 months, then full-time. Both are committed to the mission and the startup requires full focus—this is a feature, not a limitation. Prasanna is already investing personal capital into Fabriq.


Q27: McMaster Affiliation
A27: [NEEDS VERIFICATION: Are either Prasanna or Anusha McMaster alumni, students, faculty, or staff? Select: Staff / Alumni / Faculty / Student / Post Doc / N/A]


Q28: McMaster Faculty
A28: [Only answered if Q27 is not "N/A" — conditional question]


Q29: Work On Location
A29: 5+ days per week. Both are based in the GTA and will be on-site at Forge for the full duration of the program.


Q30: Time Commitment
A30:
- Prasanna: 50-60+ hours per week (full-time founder)
- Anusha: 30-40 hours per week initially (transitioning to 50+ as she reduces Amazon hours)

We're committed to the program and expect to fully engage in mentorship sessions, customer intros, and community events.


Q31: Community
A31: We'll be active members of the Forge community. Specifically:
1. Attend all mentorship sessions and cohort events.
2. Share learnings with peers—we're happy to discuss our approach to metadata-driven product design and go-to-market strategy for financial software.
3. Give back: once we have paying customers, we'll share case studies and metrics to help other founders understand the SMB finance market.
4. Network actively: we'll help other founders in the cohort connect with our advisors, customers, and contacts in the fintech space.

We believe in the power of cohort-based learning and will be active contributors.


Q32: How Did You Hear About Us?
A32: [NEEDS INPUT: How did you find Forge? (personal referral, search, event, network recommendation, etc.)]


Gaps & Assumptions to Verify

Q3, Q4 — Pending — Email and phone to be provided
Q17 — Clarify — Do you have a landing page or website to share?
Q18 — Pending — Pitch deck needs to be prepared as PDF
Q27-28 — Pending — McMaster affiliation? (Staff, Alumni, Faculty, Student, N/A)
Q32 — Pending — How did you hear about Forge?


Answers That May Need Refinement

1. Q14 (IP) — Currently describes architecture but could expand on trade secrets / competitive moats
2. Q20 (Revenue) — Conservative projection; may want to soften language given extreme early stage
3. Q23 (Why Forge) — Could emphasize more why McMaster's specific network matters (vs. generic incubators)
4. Q25-26 (Employment) — Transition timeline for Anusha could be more specific


Next Steps:
- Verify McMaster affiliation (Q27)
- Confirm website status (Q17)
- Provide contact info (Q3-4)
- Get Pitch Deck ready (Q18)
- How did you hear about Forge (Q32)
- Refine answers marked above
