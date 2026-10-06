// "Riverside Sports Club" -- the sports demo.
//
// People are referred to by first name everywhere. Days are relative to
// today: negative is in the past.

export default {
  slug: "riverside",
  secretary: "Priya", // records meetings and raises tasks

  // Deployment settings that suit this scenario (see docs/RUNBOOK.md).
  appName: "Riverside CommitteeHub",
  accent: "1F5FA8",

  roles: ["Chairperson", "Vice Chair", "Secretary", "Treasurer", "Committee Member", "Welfare Officer", "Fixtures Secretary"],
  skillAreas: ["Governance & Rules", "Finance & Admin", "Events", "Communications & Media", "Membership", "Fundraising & Sponsorship", "Welfare & Conduct", "IT & Digital"],

  // name, roles, capacity, skills as [skill area, level 1-3]
  people: [
    ["Margaret Ellis", ["Chairperson"], "available", [["Governance & Rules", 3], ["Events", 2], ["Welfare & Conduct", 2]]],
    ["David Okafor", ["Vice Chair"], "available", [["Governance & Rules", 2], ["Fundraising & Sponsorship", 3]]],
    ["Priya Shah", ["Secretary"], "stretched", [["Governance & Rules", 3], ["Communications & Media", 2], ["Membership", 2]]],
    ["Tom Whitaker", ["Treasurer"], "available", [["Finance & Admin", 3], ["Fundraising & Sponsorship", 2]]],
    ["Hannah Lloyd", ["Welfare Officer", "Committee Member"], "available", [["Welfare & Conduct", 3], ["Membership", 1]]],
    ["Marcus Bell", ["Fixtures Secretary"], "available", [["Events", 3], ["IT & Digital", 1]]],
    ["Sophie Tran", ["Committee Member"], "available", [["Communications & Media", 3], ["IT & Digital", 3]]],
    ["George Patel", ["Committee Member"], "away", [["Finance & Admin", 2], ["Events", 2]]],
    ["Aisha Rahman", ["Committee Member"], "available", [["Membership", 3], ["Events", 2], ["Communications & Media", 1]]],
    ["Chris Nowak", ["Committee Member"], "stretched", [["IT & Digital", 2], ["Fundraising & Sponsorship", 1]]],
  ],

  groups: [
    { key: "committee", name: "Main Committee", kind: "committee", quorum: 6, members: "everyone", admins: ["Margaret", "Priya"],
      description: "The full elected committee. Formal decisions are made here." },
    { key: "gala", name: "Summer Gala Working Party", kind: "working-party", quorum: 3, members: ["David", "Marcus", "Aisha", "Sophie", "Tom"], admins: ["David"],
      description: "Planning the July fundraising gala and awards evening." },
    { key: "clubhouse", name: "Clubhouse Refurbishment", kind: "working-party", quorum: 3, members: ["Tom", "George", "Chris", "Hannah", "Margaret"], admins: ["Tom"],
      description: "Changing rooms, roof repairs and the grant application to pay for them." },
  ],

  rooms: [
    { key: "general", group: "committee", name: "General", by: "Margaret", pinned: true, chats: [
      { from: 9, to: 0.2, lines: [
        ["Margaret", "Welcome to the new committee space, everyone. Agendas, decisions and actions all live here now, so nothing gets lost in email."],
        ["Priya", "Minutes from last month are in the Library. Action items have been imported as tasks, so check the Tasks tab for anything with your name on it."],
        ["Tom", "Accounts for the quarter are ready. Short version: we are about £1,400 ahead of budget, mostly thanks to the bar takings at the spring tournament."],
        ["Hannah", "Reminder that safeguarding refreshers are due for anyone who coaches juniors. I'll message people individually."],
        ["Marcus", "Fixture list for next season is drafted. I need the pitch availability from the council before I can confirm the home dates."],
        ["Margaret", "Thanks all. Next meeting is in the Calendar. Please vote on the two open motions before then so we can keep the meeting short."],
      ] },
    ] },
    { key: "membership", group: "committee", name: "Membership & Fees", by: "Aisha",
      topics: [
        { key: "fees", name: "2027 subscription rates", by: "Aisha" },
        { key: "juniors", name: "Junior section waiting list", by: "Hannah" },
      ],
      chats: [
        { topic: "fees", from: 6, to: 1, lines: [
          ["Aisha", "Membership is at 214, up 9% on last year. Proposal for 2027: adults £95 (from £90), juniors held at £40, family cap held at £220."],
          ["Tom", "That covers the insurance increase with a little to spare. I'd support it."],
          ["George", "Could we offer a discount for paying before the end of January? It would help cash flow in the quiet months."],
          ["Aisha", "Good idea. I've put a motion up with an early-bird rate of £85."],
        ] },
        { topic: "juniors", from: 4, to: 2, lines: [
          ["Hannah", "We have 17 on the junior waiting list. The limit is coaches, not pitch time."],
          ["Marcus", "Two parents have offered to do the Level 1 course if the club pays for it. About £180 each."],
          ["Hannah", "That seems well worth it. I'll raise a task to get them booked."],
        ] },
      ] },
    { key: "galaRoom", group: "gala", name: "Gala planning", by: "David", pinned: true, chats: [
      { from: 8, to: 0.5, lines: [
        ["David", "Date is confirmed: Saturday 17 July. The marquee company can do the same package as last year for £1,850."],
        ["Aisha", "Ticket price? Last year was £35 and we sold out in three weeks."],
        ["Tom", "At £40 with 160 tickets we clear about £3,200 after costs, before the raffle and auction."],
        ["Sophie", "I can have the poster and the online booking page ready by the end of the month if someone confirms the wording."],
        ["Marcus", "Awards list is nearly done. I need the junior coaches' nominations by Friday."],
        ["David", "Brilliant. Sponsors: two confirmed, one more to chase. I'll update the task when I hear back."],
      ] },
    ] },
    { key: "refurb", group: "clubhouse", name: "Refurbishment & grant", by: "Tom",
      topics: [{ key: "grant", name: "Community facilities grant", by: "Tom" }],
      chats: [
        { topic: "grant", from: 7, to: 1.5, lines: [
          ["Tom", "The community facilities fund opens next month. Maximum award is £25,000 and they want match funding of at least 20%."],
          ["George", "We have three quotes for the roof: £14,200, £15,900 and £18,500. The cheapest can't start until October."],
          ["Chris", "The application needs evidence of community use. I can pull the booking figures for the last two years."],
          ["Hannah", "Accessible changing facilities should be in the bid. It scores highly and we genuinely need them."],
          ["Tom", "Agreed. Draft application is in Documents. Comments by the 20th please."],
        ] },
      ] },
  ],

  privateChat: { from: "Margaret", text: "Could we have a quick word before Thursday's meeting about the treasurer handover? Nothing urgent." },

  decisions: [
    { group: "committee", room: "membership", topic: "fees", by: "Aisha", quorum: 6, deadline: 4, created: -2,
      title: "2027 subscription rates",
      text: "That adult subscriptions rise to £95 for 2027, with an early-bird rate of £85 for payment before 31 January. Junior and family rates are held.",
      votes: [["Tom", "yes"], ["George", "yes"], ["Margaret", "yes"], ["Chris", "no"]] },
    { group: "committee", room: "membership", topic: "juniors", by: "Hannah", quorum: 6, deadline: 1, created: -4,
      title: "Fund two Level 1 coaching courses",
      text: "That the club pays for two volunteer parents to take the Level 1 coaching course, at a total cost of up to £360, to reduce the junior waiting list.",
      votes: [["Hannah", "yes"], ["Marcus", "yes"], ["Aisha", "yes"], ["Priya", "yes"], ["David", "yes"]] },
    { group: "gala", room: "galaRoom", by: "David", quorum: 3, deadline: 6, created: -1,
      title: "Gala ticket price", text: "What should a gala ticket cost this year?",
      options: ["£35", "£40", "£45", "abstain"],
      votes: [["Tom", "£40"], ["Aisha", "£40"], ["Sophie", "£35"]] },
    { key: "marquee", group: "gala", room: "galaRoom", by: "David", quorum: 3, deadline: -3, created: -9, closedDaysAgo: 6,
      title: "Book the marquee for 17 July",
      text: "That we accept the marquee quote of £1,850 and pay the 25% deposit now to secure the date.",
      votes: [["David", "yes"], ["Tom", "yes"], ["Marcus", "yes"]] },
    { group: "committee", room: "general", by: "Tom", quorum: 6, deadline: -12, created: -20, closedDaysAgo: 14,
      title: "Approve the annual accounts",
      text: "That the committee approves the accounts for the year as presented by the Treasurer, for submission to the AGM.",
      votes: [["Margaret", "yes"], ["David", "yes"], ["Priya", "yes"], ["Hannah", "yes"], ["Marcus", "yes"], ["Sophie", "yes"], ["George", "abstain"]] },
    { group: "committee", room: "general", by: "Chris", quorum: 6, deadline: -25, created: -32, closedDaysAgo: 27,
      title: "Move committee meetings to Monday evenings",
      text: "That monthly committee meetings move from Thursday to Monday evenings from next quarter.",
      votes: [["Margaret", "no"], ["Priya", "no"], ["Tom", "no"], ["Hannah", "no"], ["Marcus", "no"], ["Aisha", "no"], ["Chris", "yes"], ["Sophie", "yes"]] },
  ],

  meetings: [
    { key: "last", group: "committee", title: "Committee meeting", days: -12, location: "Clubhouse, committee room",
      notes: "Accounts approved. Subscription rates to be put to a vote. Action items imported to Tasks." },
    { group: "committee", title: "Committee meeting", days: 5, location: "Clubhouse, committee room",
      notes: "Agenda: subscription rates, junior coaching, refurbishment grant, AOB." },
    { group: "gala", title: "Gala planning catch-up", days: 2, location: "Online", notes: "Confirm ticket price, poster wording and sponsor list." },
    { group: "clubhouse", title: "Site visit with roofing contractor", days: 9, location: "Clubhouse car park",
      notes: "Meet the preferred contractor to agree start date and access." },
    { group: "committee", title: "Annual General Meeting", days: 33, location: "Main hall", notes: "Accounts, election of officers, subscription rates." },
  ],

  tasks: [
    { group: "committee", title: "Send safeguarding refresher reminders", description: "Everyone who coaches juniors needs the refresher before the season starts.",
      who: ["Hannah"], status: "doing", priority: "high", due: 3, skills: ["Welfare & Conduct"], meeting: "last" },
    { group: "committee", title: "Confirm pitch availability with the council", description: "Needed before the home fixture dates can be published.",
      who: ["Marcus"], status: "blocked", priority: "high", due: -2, skills: ["Events"], meeting: "last" },
    { group: "committee", title: "Publish the 2027 fixture list", who: ["Marcus", "Sophie"], status: "todo", priority: "normal", due: 14,
      skills: ["Events", "Communications & Media"] },
    { group: "committee", title: "Book Level 1 coaching courses", description: "Two volunteer parents, subject to the motion passing.",
      who: ["Hannah"], status: "todo", priority: "normal", due: 10, skills: ["Welfare & Conduct", "Membership"] },
    { group: "committee", title: "Circulate AGM notice to members", description: "Must go out at least 21 days before the AGM.",
      who: ["Priya"], status: "todo", priority: "high", due: 8, skills: ["Governance & Rules"] },
    { group: "committee", title: "Renew club insurance", description: "Renewal quote received, up 6% on last year.",
      who: ["Tom"], status: "done", priority: "normal", due: -6, skills: ["Finance & Admin"], meeting: "last" },
    { group: "committee", title: "Update the membership form for 2027 rates", who: ["Aisha"], status: "todo", priority: "low", due: 20, skills: ["Membership"] },
    { group: "gala", title: "Pay the marquee deposit", description: "25% of £1,850, as agreed.",
      who: ["Tom"], status: "done", priority: "high", due: -5, skills: ["Finance & Admin"], decision: "marquee" },
    { group: "gala", title: "Design the gala poster and booking page", who: ["Sophie"], status: "doing", priority: "normal", due: 6,
      skills: ["Communications & Media", "IT & Digital"] },
    { group: "gala", title: "Chase the third sponsor", description: "Two confirmed. The garage on Mill Lane said they were interested.",
      who: ["David"], status: "doing", priority: "normal", due: 4, skills: ["Fundraising & Sponsorship"] },
    { group: "gala", title: "Collect junior award nominations", who: ["Marcus", "Aisha"], status: "todo", priority: "normal", due: 1, skills: ["Events"] },
    { group: "gala", title: "Arrange raffle prizes", who: ["Aisha"], status: "todo", priority: "low", due: 18, skills: ["Fundraising & Sponsorship"] },
    { group: "clubhouse", title: "Draft the community facilities grant application", description: "Draft is in Documents. Comments by the 20th.",
      who: ["Tom", "Chris"], status: "doing", priority: "high", due: 7, skills: ["Fundraising & Sponsorship", "Finance & Admin"] },
    { group: "clubhouse", title: "Pull two years of community booking figures", description: "Evidence of community use for the grant bid.",
      who: ["Chris"], status: "todo", priority: "normal", due: 5, skills: ["IT & Digital"] },
    { group: "clubhouse", title: "Get a fourth roofing quote", who: ["George"], status: "todo", priority: "low", due: 12, skills: ["Finance & Admin"] },
    { group: "clubhouse", title: "Survey members on changing room priorities", who: ["Hannah"], status: "done", priority: "normal", due: -10,
      skills: ["Welfare & Conduct", "Membership"] },
  ],

  documents: [
    { group: "committee", title: "Committee Meeting Minutes — last month", slug: "minutes", by: "Priya" },
    { group: "committee", title: "Annual accounts", slug: "accounts", by: "Tom" },
    { group: "gala", title: "Gala budget and running order", slug: "gala-budget", by: "David" },
    { group: "clubhouse", title: "Grant application — draft", slug: "grant-draft", by: "Tom" },
    { group: "clubhouse", title: "Roofing quotes (3)", slug: "roof-quotes", by: "George" },
  ],

  library: [
    { title: "Club Constitution", category: "Governance", description: "Adopted at the last AGM.", slug: "constitution", by: "Priya" },
    { title: "Safeguarding Policy", category: "Policies", description: "Reviewed annually by the Welfare Officer.", slug: "safeguarding", by: "Hannah" },
    { title: "Code of Conduct", category: "Policies", slug: "conduct", by: "Hannah" },
    { title: "Expenses Claim Form", category: "Forms", slug: "expenses", by: "Tom" },
    { title: "Committee Role Descriptions", category: "Governance", slug: "roles", by: "Margaret" },
  ],
};
