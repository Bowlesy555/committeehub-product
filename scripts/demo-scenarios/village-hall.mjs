// "Thornwick Village Hall" -- the non-sporting demo: a charity's management
// committee of trustees running a hall. Goes with customers/villagehall.json,
// whose roles and skill areas the labels below must match.
//
// People are referred to by first name everywhere. Days are relative to
// today: negative is in the past.

export default {
  slug: "thornwick",
  secretary: "Janet", // records meetings and raises tasks

  // name, roles, capacity, skills as [skill area, level 1-3]
  people: [
    ["Robert Hargreaves", ["Chairperson", "Trustee"], "available", [["Governance & Trusteeship", 3], ["Building & Maintenance", 2], ["Events", 1]]],
    ["Susan Whitfield", ["Vice Chair", "Trustee"], "available", [["Governance & Trusteeship", 2], ["Fundraising & Grants", 3], ["Communications", 2]]],
    ["Janet Corbett", ["Secretary", "Trustee"], "stretched", [["Governance & Trusteeship", 3], ["Communications", 2]]],
    ["Alan Metcalfe", ["Treasurer", "Trustee"], "available", [["Finance & Admin", 3], ["Fundraising & Grants", 2]]],
    ["Linda Proctor", ["Bookings Secretary"], "available", [["Bookings & Lettings", 3], ["Finance & Admin", 1], ["Communications", 1]]],
    ["Derek Ashworth", ["Trustee", "Caretaker Liaison"], "available", [["Building & Maintenance", 3], ["Health & Safety", 3]]],
    ["Nisha Kapoor", ["Trustee"], "available", [["Events", 3], ["Communications", 3], ["Fundraising & Grants", 1]]],
    ["Peter Dunn", ["Trustee"], "away", [["Health & Safety", 2], ["Building & Maintenance", 2]]],
    ["Emma Sykes", ["User Group Representative"], "available", [["Events", 2], ["Bookings & Lettings", 1]]],
  ],

  groups: [
    { key: "committee", name: "Management Committee", kind: "committee", quorum: 5, members: "everyone", admins: ["Robert", "Janet"],
      description: "The hall's trustees and user-group representatives. Formal decisions are made here." },
    { key: "kitchen", name: "Kitchen Refurbishment", kind: "working-party", quorum: 3, members: ["Derek", "Alan", "Susan", "Peter", "Robert", "Linda"], admins: ["Derek"],
      description: "Replacing the 1980s kitchen, and the grant bids to pay for it." },
    { key: "events", name: "Events & Fundraising", kind: "working-party", quorum: 3, members: ["Nisha", "Emma", "Linda", "Susan"], admins: ["Nisha"],
      description: "The hall's own events: the Christmas fair, quiz nights and the summer fete." },
  ],

  rooms: [
    { key: "general", group: "committee", name: "General", by: "Robert", pinned: true, chats: [
      { from: 10, to: 0.2, lines: [
        ["Robert", "Welcome, everyone. From now on, committee business happens here instead of the email chain. Votes, actions and papers are all in one place."],
        ["Janet", "Minutes of the last meeting are in the Library, and the actions from them are in Tasks with names and dates against each."],
        ["Alan", "Quarterly figures: hire income is £6,240, up 11% on the same quarter last year. Energy costs are still our biggest worry."],
        ["Derek", "The annual fire alarm service is booked. The electrician has flagged that the fixed wiring inspection is due before the end of next month."],
        ["Linda", "Saturday mornings are now fully booked until Easter. I'm turning away about two enquiries a week for children's parties."],
        ["Robert", "Thank you all. Two motions are open and both close before the next meeting. Please vote so we can spend the meeting on the kitchen."],
      ] },
    ] },
    { key: "bookings", group: "committee", name: "Bookings & Hire", by: "Linda",
      topics: [
        { key: "charges", name: "Hire charges for next year", by: "Linda" },
        { key: "regulars", name: "Regular hirers", by: "Linda" },
      ],
      chats: [
        { topic: "charges", from: 7, to: 1, lines: [
          ["Linda", "Our hourly rates haven't moved in three years. Proposal: main hall £18 an hour (from £15) for private hire, with regular community groups held at £12."],
          ["Alan", "On current bookings that brings in roughly £1,900 more a year, which just about covers the rise in the electricity bill."],
          ["Emma", "The toddler group and the art class would struggle with any increase. Holding the community rate matters a lot to them."],
          ["Linda", "Agreed. The community rate is held in the motion. Only private and commercial hire goes up."],
        ] },
        { topic: "regulars", from: 5, to: 2, lines: [
          ["Linda", "The Tuesday yoga class has asked to move to Thursdays. That clashes with the WI once a month."],
          ["Nisha", "Could yoga use the committee room on WI nights? It holds twelve comfortably."],
          ["Linda", "Good thought. I'll ask the instructor and update the booking diary."],
        ] },
      ] },
    { key: "kitchenRoom", group: "kitchen", name: "Kitchen project", by: "Derek", pinned: true,
      topics: [{ key: "funding", name: "Grant funding", by: "Susan" }],
      chats: [
        { from: 9, to: 3, lines: [
          ["Derek", "Three quotes are in for the kitchen: £21,400, £23,750 and £27,900. The middle one includes a commercial dishwasher and comes with the best references."],
          ["Peter", "Whichever we choose, environmental health will want stainless surfaces and a separate hand-wash basin. The cheapest quote doesn't include the basin."],
          ["Alan", "We have £8,000 in the building reserve. The rest has to come from grants and fundraising."],
        ] },
        { topic: "funding", from: 6, to: 0.5, lines: [
          ["Susan", "Two funds look promising. The county's community buildings fund offers up to £15,000 and closes in five weeks. The lottery's small grants programme is rolling, up to £10,000."],
          ["Alan", "The county fund wants our last two years of accounts and evidence of who uses the hall."],
          ["Linda", "I can produce a list of every group that hired the hall this year, with hours."],
          ["Susan", "Perfect. I've started the county application. The draft is in Documents, and the deadline is in the Calendar."],
        ] },
      ] },
    { key: "eventsRoom", group: "events", name: "Events planning", by: "Nisha", chats: [
      { from: 6, to: 0.4, lines: [
        ["Nisha", "Christmas fair is Saturday 5 December. We have 22 stalls booked out of 30, and Father Christmas is confirmed."],
        ["Emma", "The primary school choir can sing at 2pm. They need the stage clear and somewhere to hang coats."],
        ["Linda", "I've blocked the whole hall in the diary from Friday evening for setting up."],
        ["Nisha", "Lovely. Quiz night poster is ready too. Could someone check the wording before I print 50?"],
      ] },
    ] },
  ],

  privateChat: { from: "Robert", text: "Could we speak before the next meeting about the caretaker's hours? I'd rather not raise it cold in front of everyone." },

  decisions: [
    { group: "committee", room: "bookings", topic: "charges", by: "Linda", quorum: 5, deadline: 5, created: -3,
      title: "Hire charges from January",
      text: "That private and commercial hire of the main hall rises to £18 an hour from 1 January, with the community group rate held at £12 an hour.",
      votes: [["Alan", "yes"], ["Linda", "yes"], ["Robert", "yes"], ["Emma", "no"]] },
    { group: "committee", room: "general", by: "Derek", quorum: 5, deadline: 1, created: -5,
      title: "Commission the fixed wiring inspection",
      text: "That we accept the electrician's quote of £680 for the five-yearly fixed wiring inspection, to be completed before the end of next month.",
      votes: [["Derek", "yes"], ["Peter", "yes"], ["Robert", "yes"], ["Janet", "yes"]] },
    { group: "kitchen", room: "kitchenRoom", by: "Derek", quorum: 3, deadline: 7, created: -2,
      title: "Preferred kitchen contractor", text: "Which quote should we take forward as the basis for our grant applications?",
      options: ["£21,400 quote", "£23,750 quote", "£27,900 quote", "abstain"],
      votes: [["Derek", "£23,750 quote"], ["Peter", "£23,750 quote"], ["Alan", "£21,400 quote"]] },
    { key: "fair", group: "events", room: "eventsRoom", by: "Nisha", quorum: 3, deadline: -4, created: -11, closedDaysAgo: 8,
      title: "Christmas fair stall fee",
      text: "That stallholders pay £15 a table at the Christmas fair, with charity stalls free.",
      votes: [["Nisha", "yes"], ["Emma", "yes"], ["Linda", "yes"]] },
    { group: "committee", room: "general", by: "Alan", quorum: 5, deadline: -14, created: -22, closedDaysAgo: 16,
      title: "Approve the annual accounts",
      text: "That the trustees approve the accounts for the year as presented by the Treasurer, for submission to the Charity Commission and the AGM.",
      votes: [["Robert", "yes"], ["Susan", "yes"], ["Janet", "yes"], ["Derek", "yes"], ["Nisha", "yes"], ["Peter", "abstain"]] },
    { group: "committee", room: "general", by: "Peter", quorum: 5, deadline: -28, created: -36, closedDaysAgo: 30,
      title: "Allow alcohol sales without a committee member present",
      text: "That hirers may sell alcohol under the hall's licence without a committee member in attendance.",
      votes: [["Robert", "no"], ["Susan", "no"], ["Janet", "no"], ["Alan", "no"], ["Derek", "no"], ["Peter", "yes"], ["Nisha", "yes"]] },
  ],

  meetings: [
    { key: "last", group: "committee", title: "Management Committee meeting", days: -13, location: "Committee room",
      notes: "Accounts approved. Hire charges to be put to a vote. Kitchen quotes received. Action items imported to Tasks." },
    { group: "committee", title: "Management Committee meeting", days: 6, location: "Committee room",
      notes: "Agenda: hire charges, kitchen contractor, grant applications, wiring inspection, AOB." },
    { group: "kitchen", title: "Site visit with kitchen contractor", days: 3, location: "Hall kitchen",
      notes: "Walk round with the preferred contractor to confirm what is and isn't included." },
    { group: "events", title: "Christmas fair planning", days: 8, location: "Online", notes: "Stall plan, volunteers rota, raffle prizes." },
    { group: "kitchen", title: "County community buildings fund: application deadline", days: 35, location: "Online form",
      notes: "Application must be submitted by 5pm. Accounts and usage evidence attached." },
    { group: "committee", title: "Annual General Meeting", days: 48, location: "Main hall", notes: "Trustees' report, accounts, election of officers." },
  ],

  tasks: [
    { group: "committee", title: "Book the fixed wiring inspection", description: "Subject to the motion passing. Must be done before the end of next month.",
      who: ["Derek"], status: "todo", priority: "high", due: 9, skills: ["Health & Safety", "Building & Maintenance"], meeting: "last" },
    { group: "committee", title: "Renew the premises licence", description: "Annual fee is due. The form needs the designated supervisor's details.",
      who: ["Janet"], status: "blocked", priority: "high", due: -3, skills: ["Governance & Trusteeship"], meeting: "last" },
    { group: "committee", title: "Update the hire agreement with the new charges", who: ["Linda", "Janet"], status: "todo", priority: "normal", due: 15,
      skills: ["Bookings & Lettings", "Governance & Trusteeship"] },
    { group: "committee", title: "File the annual return with the Charity Commission", description: "Due within ten months of the year end.",
      who: ["Alan"], status: "doing", priority: "high", due: 12, skills: ["Finance & Admin", "Governance & Trusteeship"] },
    { group: "committee", title: "Renew hall insurance", description: "Renewal quote received, up 8% on last year.",
      who: ["Alan"], status: "done", priority: "normal", due: -7, skills: ["Finance & Admin"], meeting: "last" },
    { group: "committee", title: "Review the fire risk assessment", who: ["Peter", "Derek"], status: "todo", priority: "normal", due: 21, skills: ["Health & Safety"] },
    { group: "committee", title: "Ask the yoga instructor about the committee room", description: "For WI nights, once a month.",
      who: ["Linda"], status: "doing", priority: "low", due: 4, skills: ["Bookings & Lettings"] },
    { group: "kitchen", title: "Draft the county community buildings fund application", description: "Draft is in Documents. Closes in five weeks.",
      who: ["Susan", "Alan"], status: "doing", priority: "high", due: 20, skills: ["Fundraising & Grants", "Finance & Admin"] },
    { group: "kitchen", title: "List every hirer this year, with hours", description: "Evidence of community use for both grant bids.",
      who: ["Linda"], status: "todo", priority: "normal", due: 6, skills: ["Bookings & Lettings"] },
    { group: "kitchen", title: "Check kitchen plans with environmental health", who: ["Peter"], status: "todo", priority: "normal", due: 14, skills: ["Health & Safety"] },
    { group: "kitchen", title: "Get references for the preferred contractor", who: ["Derek"], status: "done", priority: "normal", due: -5, skills: ["Building & Maintenance"] },
    { group: "events", title: "Confirm remaining Christmas fair stalls", description: "22 of 30 booked.", who: ["Nisha"], status: "doing", priority: "normal", due: 10,
      skills: ["Events"], decision: "fair" },
    { group: "events", title: "Proofread and print the quiz night poster", who: ["Emma", "Nisha"], status: "todo", priority: "normal", due: 1, skills: ["Communications"] },
    { group: "events", title: "Organise the volunteers rota for the fair", who: ["Emma"], status: "todo", priority: "normal", due: 18, skills: ["Events"] },
    { group: "events", title: "Collect raffle prizes from local businesses", who: ["Susan"], status: "todo", priority: "low", due: 25, skills: ["Fundraising & Grants"] },
  ],

  documents: [
    { group: "committee", title: "Management Committee Minutes — last month", slug: "vh-minutes", by: "Janet" },
    { group: "committee", title: "Annual accounts", slug: "vh-accounts", by: "Alan" },
    { group: "committee", title: "Hire charges comparison with nearby halls", slug: "vh-charges", by: "Linda" },
    { group: "kitchen", title: "Kitchen quotes (3)", slug: "vh-kitchen-quotes", by: "Derek" },
    { group: "kitchen", title: "County community buildings fund — draft application", slug: "vh-grant-draft", by: "Susan" },
    { group: "events", title: "Christmas fair stall plan", slug: "vh-stall-plan", by: "Nisha" },
  ],

  library: [
    { title: "Governing Document (Trust Deed)", category: "Governance", description: "The charity's constitution.", slug: "vh-trust-deed", by: "Janet" },
    { title: "Standard Hire Agreement", category: "Hiring", description: "Terms and conditions every hirer signs.", slug: "vh-hire-agreement", by: "Linda" },
    { title: "Hire Charges", category: "Hiring", slug: "vh-hire-charges", by: "Linda" },
    { title: "Fire Risk Assessment", category: "Health & Safety", description: "Reviewed annually.", slug: "vh-fire-risk", by: "Derek" },
    { title: "Safeguarding Policy", category: "Policies", slug: "vh-safeguarding", by: "Janet" },
    { title: "Trustee Role Descriptions", category: "Governance", slug: "vh-roles", by: "Robert" },
  ],
};
