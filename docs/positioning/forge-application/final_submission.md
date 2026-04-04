Problem

Finance teams don't just have a time problem — they have an intelligence problem. Today's accounting tools (QuickBooks, Xero) are static: they apply the same rules to every company. When a finance team needs a custom workflow (bank reconciliation with their specific matching rules, collections triage based on customer risk, dunning with approval chains), they face a dead end: either live with a broken process or rely on a human expert. 

Finance workflows are pattern-based and learnable. A reconciliation matching rule — "if posting amount matches invoice amount and dates are within 3 days, it's likely the same transaction" — is something an AI agent should learn autonomously, get better at with feedback, and adapt when the pattern changes (e.g., new payment processor with different timing). But no tool today does this. Competitors like Ramp, Rillet, and Kick are building agentic AI, but they're vertical (AP automation, ERP, bookkeeping only). There's no configurable agentic platform for SMBs that need reconciliation + payables + collections + custom workflows.

The cost: 20-50 hours/month in manual reconciliation that an autonomous agent could handle. But more importantly: finance teams can't optimize their workflow because they're handcuffed to tools that won't adapt.

---

Solution 

Fabriq is an AI Native financial agent platform. Instead of hardcoding workflows in code, finance teams define their goals — "reconcile my TD account," "match invoices to payments," "triage collections" — and Fabriq deploys autonomous agents to execute them.

How agents work:
1. Plan: The agent decomposes the goal into steps (query unmatched postings → analyze matching patterns → suggest matches → queue for review)
2. Execute: The agent intelligently executes each step using real-time data and learned patterns
3. Suggest: The agent surfaces high-confidence matches for instant approval and uncertain matches for human review
4. Learn: When humans approve/reject suggestions, the agent learns which matching rules work, which need override, which edge cases require judgment
5. Adapt: Agents continuously refine their logic and adapt to workflow changes

The agent autonomously finds unmatched bank transactions, suggests matches to invoices/receipts using learned matching logic, and queues matches for human review. High-confidence matches (e.g., 95%+ exact amount + date match) auto-approve; uncertain ones route to humans for judgment. This shrinks month-end close from days to hours while keeping humans in control.

Key difference from incumbents: QuickBooks and Xero are the default for SMBs but largely static — same rules for every company, limited room for custom reconciliation or approval chains without bolt-ons. NetSuite and similar ERPs are powerful but costly, slow to implement, and still leave finance teams doing heavy manual matching. Fabriq agents are configurable for any financial workflow — reconciliation, payables, collections, custom rules — without custom code. Finance teams define the workflow once, agents run autonomously, humans focus on judgment.

---

Value Proposition

Fabriq runs the mechanical side of finance — matching transactions, categorizing spend, and triaging what needs attention—so people on the finance team spend their time on decisions, not grunt work. The same autonomous agents adapt to how you operate: bank reconciliation, payables, collections, or any financial workflow you care about, without locking you into a single vertical tool. The outcome we aim for is a steep drop in hours spent on reconciliation (on the order of 80%), accuracy around 99%, and agents that keep getting better as your business evolves.

---
Target Market

Finance and accounting teams at small businesses ($5M-100M revenue) in North America—primarily US and Canada. They've outgrown QuickBooks/Xero but can't justify $100K+ ERPs. Their pain points: manual reconciliation (bank, AP, AR), high error rates, month-end close delays, tool fragmentation, and inability to automate custom workflows. Current customers in conversations: staffing/recruitment agencies, small manufacturing, professional services, and e-commerce. These verticals have complex multi-account reconciliation, high transaction volumes, and variable approval workflows—exactly what Fabriq solves.


----

Market Size


- TAM (Total Addressable Market): ~$18B. 5.6M small businesses in North America with finance/accounting needs. Average accounting software spend: $3K-5K/year per company.
- SAM (Serviceable Addressable Market): ~$2B. 200K+ SMBs ($5M-100M revenue) actively looking for better accounting solutions beyond QuickBooks/Xero. Average spend per customer: $10K/year (usage-based model).
- SOM (Serviceable Obtainable Market): $50M+ in Year 3-5. Conservative 5K customers at $10K ARR each. Aggressive path: 10K customers = $100M+.
Since this is an universal / global problem, fabriq can be adapted to other geographies. 
(Sources: US Census Bureau, Bureau of Labor Statistics, SMB accounting software benchmarks.)


----

Validation

We've validated the problem through 5-6 early-stage customer conversations with accounting teams in staffing and e-commerce verticals. Feedback: "Month-end close is killing us," "We can't customize our tools," "We juggle 4 spreadsheets and 3 apps." We built a working MVP focusing on the #1 pain point: bank reconciliation. We've also reviewed competitive products (QuickBooks, Xero, SAP, NetSuite, custom solutions) and confirmed there's no middle ground for configurable automation.

----

Business Model


Usage-based / outcome-based pricing. We charge based on value delivered: per-transaction reconciled, per-account automated, or per-month of active automation. This aligns incentives—we win when the customer automates more and saves more time. Pricing is transparent and scales with their growth. Example: $500/month base + $0.05 per transaction reconciled. This contrasts with per-user SaaS (discourages adoption) or fixed licensing (ignores usage). As the FinTech world shifts to outcome-based models, this positions us with modern buyer expectations and reduces buyer resistance at proof-of-concept.


----

Go-to-Market

- Phase 1 (Months 1-6): Validation. Close 2-3 paying pilots with hand-picked customers from our network. Focus on bank reconciliation (highest ROI, tightest workflow, easiest to measure impact). Build case studies.
- Phase 2 (Months 6-12): Expand playbook. Productize the reconciliation workflow. Expand to 1-2 new verticals.
- Phase 3 (Year 2): Expand feature set. Add payables automation, AR, multi-account workflows. Target: reach 20-50 paying customers.

Channel strategy: (1) direct sales to SMB finance teams via content (finance blog, LinkedIn, industry forums); (2) partnerships with accounting firms and bookkeeping services (resale, referral); (3) vertical partnerships (staffing platforms, e-commerce marketplaces).


---
Competitive Analysis

- QuickBooks / Xero: Dominate SMB accounting but are static tools. They can't adapt to custom workflows or learn from your data. $35-235/month, limited customization.
- Agentic competitors emerging (Ramp, Rillet, Kick): These are moving to autonomous AI agents — which is the right direction. Ramp (AP automation, $50K+ deployment), Rillet (AI-native ERP, $10K+/month), Kick (bookkeeping-only). Problem: they're vertical and rigid. Ramp does AP well but can't do reconciliation or collections. Rillet is an ERP, not an agent platform. Kick is bookkeeping-only. Fabriq is horizontal and configurable — same agentic intelligence, any workflow.
- NetSuite / SAP: Highly configurable but enterprise-focused, $100K+ implementation, 6-18 month sales cycles.


----

Intellectual Property

NA

-------

Stage

Alpha Test


-----State of the Product


MVP with early customer validation. We have a working prototype with functional bank reconciliation, basic approval workflows, and integration with quickbooks and zoho books. We're in early conversations with 5-6 SMBs (staffing, e-commerce). Not yet in market with revenue, but far enough along that we're collecting feedback and resfining product-market fit rather than validating the problem.


----Funding

We have developed the MVP with personal investment

----Revenue

$0 to date. We're pre-revenue (very early stage).

-----
Team

Prasanna Jaganathan (Co-founder, Technical Lead): 20+ years building metadata-driven platforms and financial products. Masters in Engineering from USC. Patent in hierarchical datamodel definition.
Anusha Srinivasan (Co-founder, Business Lead): 15+ years in operations, product, and business strategy. Currently working at Amazon as product management.  Transitioning full time to fabriq. 


----
Why Forge

We think Forge might be the right partner for Fabriq at this stage.

(1) Mentorship: We need guidance on GTM (how to position against incumbents, how to land pilot customers), fundraising strategy (when, how much, who to target), and navigating financial/compliance requirements.

(2) Customer network: We need pilot customers fast. Forge's connections to SMB finance teams, accounting firms, and business leaders in Ontario/Canada are invaluable.


-----

Location

We are based of Etobicoke, in GTA.  We will gladly volunteer and participate in the community for any kind of event.  


-----

EMployment Status Continued

We are seasoned professionals in technology, finance and business operations.  We are committed to the mission and understand that the startup requires full focus—this is a feature, not a limitation. Prasanna is already 100% focused on Fabriq. 

------
Community


We'll be active members of the Forge community. Specifically:
1. Attend all mentorship sessions and cohort events.
2. Share learnings with peers—we're happy to discuss our approach to metadata-driven product design and go-to-market strategy for financial software.
3. Give back: once we have paying customers, we'll share case studies and metrics to help other founders understand the SMB finance market.
4. Network actively: we'll help other founders in the cohort connect with our advisors, customers, and contacts in the fintech space.
We believe in the power of cohort-based learning and will be active contributors.


How did you hear about us

We were actively looking for incubators and the forge was one of the prominent ones that came up during the search.  
