export type SheetMeeting = {
  id: string;
  account: string;
  client: string;
  role: string;
  email: string;
  phone: string;
  meetingDate: string;
  meetingTime: string;
  meetingNotes: string;
  nextSteps: string;
  status: "Scheduled" | "Completed" | "Needs follow-up";
  source: "Sheet" | "Calendar";
  calendarEventId?: string;
  calendarEventLink?: string;
};

export const sheetSeedData: SheetMeeting[] = [
  {
    id: "stg-logistics-salvatore-didonato",
    account: "STG Logistics",
    client: "Salvatore DiDonato",
    role: "CIO",
    email: "salvatore.didonato@stgusa.com",
    phone: "908-499-1298",
    meetingDate: "2026-03-09",
    meetingTime: "09:00",
    meetingNotes: "",
    nextSteps: "",
    status: "Scheduled",
    source: "Sheet"
  },
  {
    id: "je-dunn-aaron-orpin",
    account: "JE Dunn",
    client: "Aaron Orpin",
    role: "Director of Data",
    email: "Aaron.Orpin@jedunn.com",
    phone: "",
    meetingDate: "2026-03-09",
    meetingTime: "09:00",
    meetingNotes: "",
    nextSteps: "",
    status: "Scheduled",
    source: "Sheet"
  },
  {
    id: "sage-hospitality-group-daniel-de-olmo",
    account: "Sage Hospitality Group",
    client: "Daniel De Olmo",
    role: "CEO",
    email: "daniel.delolmo@sagehospitalitygroup.com",
    phone: "973-723-8058",
    meetingDate: "2026-03-27",
    meetingTime: "09:00",
    meetingNotes: "CEO & CTO Meeting",
    nextSteps: "",
    status: "Scheduled",
    source: "Sheet"
  },
  {
    id: "sage-hospitality-group-mark-schwartz",
    account: "Sage Hospitality Group",
    client: "Mark Schwartz",
    role: "CTO",
    email: "matt.schwartz@sagehospitalitygroup.com",
    phone: "720-482-7127",
    meetingDate: "2026-03-12",
    meetingTime: "09:00",
    meetingNotes: "Intro to CTO",
    nextSteps: "",
    status: "Scheduled",
    source: "Sheet"
  },
  {
    id: "vitamin-shoppe-andrew-laudato",
    account: "Vitamin Shoppe",
    client: "Andrew Laudato",
    role: "COO",
    email: "Andrew.Laudato@vitaminshoppe.com",
    phone: "",
    meetingDate: "2026-03-13",
    meetingTime: "09:00",
    meetingNotes: "",
    nextSteps: "",
    status: "Scheduled",
    source: "Sheet"
  },
  {
    id: "chimes-international-dale-goff",
    account: "Chimes International",
    client: "Dale Goff",
    role: "Director Of Tech Services",
    email: "dale.goff@chimes.org",
    phone: "410-585-2089",
    meetingDate: "2026-03-09",
    meetingTime: "09:00",
    meetingNotes: "",
    nextSteps: "",
    status: "Scheduled",
    source: "Sheet"
  },
  {
    id: "lanco-group-jason-morris",
    account: "Lanco Group",
    client: "Jason Morris",
    role: "Director of Technology",
    email: "jmorris@mjmc.com",
    phone: "7082252350",
    meetingDate: "2026-03-12",
    meetingTime: "09:00",
    meetingNotes: "",
    nextSteps: "",
    status: "Scheduled",
    source: "Sheet"
  },
  {
    id: "tms-anthony-knighten",
    account: "TMS",
    client: "Anthony Knighten",
    role: "VP of IT Management",
    email: "Anthony.Knighten@tmsw.com",
    phone: "309-643-2877",
    meetingDate: "2026-03-10",
    meetingTime: "09:00",
    meetingNotes: "Chicago City Dinner Invite Sent",
    nextSteps: "",
    status: "Scheduled",
    source: "Sheet"
  }
];
