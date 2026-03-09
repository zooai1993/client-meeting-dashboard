"use client";

import Script from "next/script";
import { ChangeEvent, FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { masterAccounts } from "../lib/account-list";
import { SheetMeeting, sheetSeedData } from "../lib/sheet-data";

type MeetingStatus = SheetMeeting["status"];
type EmailActivity = {
  email: string;
  timestamp: number;
  label: string;
};
type MeetingField = keyof Pick<
  SheetMeeting,
  "meetingDate" | "meetingTime" | "touchpointType" | "meetingNotes" | "nextSteps" | "status"
>;
type MeetingDraft = Pick<
  SheetMeeting,
  "meetingDate" | "meetingTime" | "touchpointType" | "meetingNotes" | "nextSteps" | "status"
>;

const STORAGE_KEY = "client-meeting-dashboard";
const DRAFT_STORAGE_KEY = "client-meeting-dashboard-draft";
const EMAIL_ACTIVITY_STORAGE_KEY = "client-meeting-dashboard-email-activity";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const DAILY_QUOTES = [
  { quote: "Success is no accident.", author: "Pele" },
  { quote: "Dreams don’t work unless you do.", author: "John C. Maxwell" },
  { quote: "Make each day your masterpiece.", author: "John Wooden" },
  { quote: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { quote: "It always seems impossible until it’s done.", author: "Nelson Mandela" },
  { quote: "I never lose. I either win or learn.", author: "Nelson Mandela" },
  { quote: "If you can dream it, you can do it.", author: "Walt Disney" }
] as const;

const defaultForm = {
  account: "",
  client: "",
  role: "",
  email: "",
  meetingDate: "",
  meetingTime: "",
  touchpointType: "Meeting" as NonNullable<SheetMeeting["touchpointType"]>,
  meetingNotes: ""
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

function createId(account: string, client: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${account}-${client}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function getMeetingDate(meeting: SheetMeeting) {
  return new Date(`${meeting.meetingDate}T${meeting.meetingTime || "09:00"}`);
}

function formatMeetingDate(meeting: SheetMeeting) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(getMeetingDate(meeting));
}

function readStoredMeetings() {
  if (typeof window === "undefined") {
    return sheetSeedData;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sheetSeedData));
    return sheetSeedData;
  }

  try {
    return JSON.parse(raw) as SheetMeeting[];
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sheetSeedData));
    return sheetSeedData;
  }
}

function readStoredDraft() {
  if (typeof window === "undefined") {
    return defaultForm;
  }

  const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) {
    return defaultForm;
  }

  try {
    return { ...defaultForm, ...JSON.parse(raw) } as typeof defaultForm;
  } catch {
    return defaultForm;
  }
}

function readStoredEmailActivity() {
  if (typeof window === "undefined") {
    return {} as Record<string, EmailActivity>;
  }

  const raw = window.localStorage.getItem(EMAIL_ACTIVITY_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, EmailActivity>;
  }

  try {
    return JSON.parse(raw) as Record<string, EmailActivity>;
  } catch {
    return {} as Record<string, EmailActivity>;
  }
}

export default function Page() {
  const [meetings, setMeetings] = useState<SheetMeeting[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [calendarStatus, setCalendarStatus] = useState("Calendar not connected.");
  const [gmailStatus, setGmailStatus] = useState("Gmail not connected.");
  const [importStatus, setImportStatus] = useState("");
  const [emailActivity, setEmailActivity] = useState<Record<string, EmailActivity>>({});
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const tokenClientRef = useRef<{
    requestAccessToken: (options?: { prompt?: string }) => void;
  } | null>(null);
  const gmailTokenClientRef = useRef<{
    requestAccessToken: (options?: { prompt?: string }) => void;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    setMeetings(readStoredMeetings());
    setForm(readStoredDraft());
    setEmailActivity(readStoredEmailActivity());
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  }, [hasHydrated, meetings]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
  }, [form, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    window.localStorage.setItem(EMAIL_ACTIVITY_STORAGE_KEY, JSON.stringify(emailActivity));
  }, [emailActivity, hasHydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => getMeetingDate(a).getTime() - getMeetingDate(b).getTime()),
    [meetings]
  );

  const filteredMeetings = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return sortedMeetings;
    }

    return sortedMeetings.filter((meeting) =>
      [
        meeting.account,
        meeting.client,
        meeting.email,
        meeting.role,
        meeting.meetingNotes,
        meeting.nextSteps
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [deferredSearch, sortedMeetings]);

  const now = currentTime;
  const weekMeetings = filteredMeetings.filter((meeting) => isInNextSevenDays(meeting, now));
  const activeMeetings = weekMeetings.filter((meeting) => !isArchivedMeeting(meeting, now));
  const archivedMeetings = [...filteredMeetings]
    .filter((meeting) => isArchivedMeeting(meeting, now))
    .sort((a, b) => getMeetingDate(b).getTime() - getMeetingDate(a).getTime());
  const accountLeads = useMemo(
    () => buildAccountLeads(meetings, masterAccounts, emailActivity),
    [emailActivity, meetings]
  );
  const selectedAccountDetail = useMemo(
    () => accountLeads.find((account) => account.account === selectedAccount) ?? null,
    [accountLeads, selectedAccount]
  );
  const selectedAccountLeads = useMemo(
    () => accountLeads.find((account) => account.account === form.account)?.leads ?? [],
    [accountLeads, form.account]
  );
  const scheduledMeetings = useMemo(
    () =>
      sortedMeetings.filter(
        (meeting) => isInNextSevenDays(meeting, now) && meeting.status === "Scheduled"
      ),
    [now, sortedMeetings]
  );
  const upcomingCount = activeMeetings.filter((meeting) => getMeetingDate(meeting) >= now).length;
  const archivedCount = archivedMeetings.length;
  const followUpCount = activeMeetings.filter((meeting) => meeting.status === "Needs follow-up").length;
  const staleLeads = useMemo(
    () =>
      accountLeads
        .flatMap((account) => account.leads.map((lead) => ({ ...lead, account: account.account })))
        .filter(
          (lead) =>
            lead.latestTouchpointTimestamp > 0 &&
            businessDaysSince(lead.latestTouchpointTimestamp, now) >= 2
        )
        .sort((a, b) => a.latestTouchpointTimestamp - b.latestTouchpointTimestamp)
        .slice(0, 5),
    [accountLeads, now]
  );
  const dailyQuote = useMemo(() => getDailyQuote(now), [now]);
  const quarterCountdown = useMemo(() => getQuarterCountdown(now), [now]);

  function initializeGoogleClient() {
    if (!googleClientId || !window.google) {
      return;
    }

    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: GOOGLE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          setCalendarStatus("Calendar connection failed.");
          return;
        }

        setCalendarToken(response.access_token);
        setCalendarStatus("Calendar connected.");
      }
    });

    gmailTokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: GMAIL_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          setGmailStatus("Gmail connection failed.");
          return;
        }

        setGmailToken(response.access_token);
        setGmailStatus("Gmail connected.");
      }
    });
  }

  function updateMeeting(id: string, field: MeetingField, value: string) {
    startTransition(() => {
      setMeetings((current) =>
        current.map((meeting) => (meeting.id === id ? { ...meeting, [field]: value } : meeting))
      );
    });
  }

  function saveMeeting(id: string, draft: MeetingDraft) {
    startTransition(() => {
      setMeetings((current) =>
        current.map((meeting) => (meeting.id === id ? { ...meeting, ...draft } : meeting))
      );
    });
  }

  function handleAccountChange(account: string) {
    setForm((current) => ({
      ...current,
      account,
      client: "",
      role: "",
      email: ""
    }));
  }

  function handleLeadChange(client: string) {
    if (client === "__new__") {
      setForm((current) => ({
        ...current,
        client: "",
        role: "",
        email: ""
      }));
      return;
    }

    const selectedLead = selectedAccountLeads.find((lead) => lead.client === client);

    setForm((current) => ({
      ...current,
      client,
      role: selectedLead?.role ?? "",
      email: selectedLead?.email ?? ""
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextMeeting: SheetMeeting = {
      id: createId(form.account, form.client),
      account: form.account.trim(),
      client: form.client.trim(),
      role: form.role.trim(),
      email: form.email.trim(),
      phone: "",
      meetingDate: form.meetingDate,
      meetingTime: form.meetingTime,
      touchpointType: form.touchpointType,
      meetingNotes: form.meetingNotes.trim(),
      nextSteps: "",
      status: "Scheduled",
      source: "Sheet"
    };

    startTransition(() => {
      setMeetings((current) => [...current, nextMeeting]);
      setForm(defaultForm);
    });

    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  }

  async function connectCalendar() {
    if (!googleClientId) {
      setCalendarStatus("Add Google client ID in Vercel settings.");
      return;
    }

    if (!tokenClientRef.current) {
      setCalendarStatus("Google client still loading.");
      return;
    }

    tokenClientRef.current.requestAccessToken({ prompt: "consent" });
  }

  async function syncCalendar() {
    if (!calendarToken) {
      setCalendarStatus("Connect calendar first.");
      return;
    }

    setCalendarStatus("Syncing...");

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", new Date().toISOString());
    url.searchParams.set("maxResults", "50");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${calendarToken}` }
    });

    if (!response.ok) {
      setCalendarStatus("Calendar sync failed.");
      return;
    }

    const data = (await response.json()) as {
      items?: Array<{
        id: string;
        htmlLink?: string;
        summary?: string;
        description?: string;
        attendees?: Array<{ email?: string }>;
        start?: { date?: string; dateTime?: string };
      }>;
    };

    const items = data.items ?? [];
    let matches = 0;

    startTransition(() => {
      setMeetings((current) =>
        current.map((meeting) => {
          const matchedEvent = items.find((event) => eventMatchesMeeting(event, meeting));
          if (!matchedEvent) {
            return meeting;
          }

          matches += 1;
          const { meetingDate, meetingTime } = getEventStart(matchedEvent.start);

          return {
            ...meeting,
            meetingDate,
            meetingTime,
            source: "Calendar",
            calendarEventId: matchedEvent.id,
            calendarEventLink: matchedEvent.htmlLink
          };
        })
      );
    });

    setCalendarStatus(matches ? `Synced ${matches} records.` : "No matching events found.");
  }

  async function connectGmail() {
    if (!googleClientId) {
      setGmailStatus("Add Google client ID in Vercel settings.");
      return;
    }

    if (!gmailTokenClientRef.current) {
      setGmailStatus("Google client still loading.");
      return;
    }

    gmailTokenClientRef.current.requestAccessToken({ prompt: "consent" });
  }

  async function syncGmail() {
    if (!gmailToken) {
      setGmailStatus("Connect Gmail first.");
      return;
    }

    setGmailStatus("Syncing Gmail...");

    const leads = accountLeads.flatMap((account) => account.leads).filter((lead) => Boolean(lead.email));
    const nextActivity: Record<string, EmailActivity> = {};

    for (const lead of leads) {
      const email = lead.email.toLowerCase();
      const query = encodeURIComponent(`(from:${email} OR to:${email})`);
      const listResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=${query}`,
        {
          headers: { Authorization: `Bearer ${gmailToken}` }
        }
      );

      if (!listResponse.ok) {
        continue;
      }

      const listData = (await listResponse.json()) as {
        messages?: Array<{ id: string }>;
      };

      const messageId = listData.messages?.[0]?.id;
      if (!messageId) {
        continue;
      }

      const messageResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Date&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To`,
        {
          headers: { Authorization: `Bearer ${gmailToken}` }
        }
      );

      if (!messageResponse.ok) {
        continue;
      }

      const messageData = (await messageResponse.json()) as {
        payload?: {
          headers?: Array<{ name?: string; value?: string }>;
        };
      };

      const headers = messageData.payload?.headers ?? [];
      const dateHeader = headers.find((header) => header.name?.toLowerCase() === "date")?.value;
      const parsedDate = dateHeader ? Date.parse(dateHeader) : Number.NaN;
      if (Number.isNaN(parsedDate)) {
        continue;
      }

      nextActivity[email] = {
        email,
        timestamp: parsedDate,
        label: "Gmail"
      };
    }

    setEmailActivity(nextActivity);
    setGmailStatus(
      Object.keys(nextActivity).length
        ? `Synced ${Object.keys(nextActivity).length} lead email timestamps.`
        : "No recent Gmail activity found for current leads."
    );
  }

  function handleDelete(id: string) {
    startTransition(() => {
      setMeetings((current) => current.filter((meeting) => meeting.id !== id));
    });
  }

  function openImportPicker() {
    importInputRef.current?.click();
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      setImportStatus("No rows found in import file.");
      event.target.value = "";
      return;
    }

    const header = rows[0].map((cell) => cell.trim().toLowerCase());
    const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim()));
    const imported = dataRows.map((row) => mapImportedRow(row, header)).filter(Boolean) as SheetMeeting[];

    if (!imported.length) {
      setImportStatus("Import file did not match expected columns.");
      event.target.value = "";
      return;
    }

    startTransition(() => {
      setMeetings((current) => [...current, ...imported]);
    });
    setImportStatus(`Imported ${imported.length} ${imported.length === 1 ? "row" : "rows"}.`);
    event.target.value = "";
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={initializeGoogleClient}
      />
      <main className="page-shell">
        <input
          ref={importInputRef}
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          onChange={handleImport}
        />
        <section className="topbar">
          <div className="topbar-main">
            <button
              className="home-button"
              type="button"
              onClick={() => {
                setSelectedAccount("");
                setShowArchive(false);
              }}
              aria-label="Go home"
            >
              Home
            </button>
            <p className="eyebrow">OpenAI Accounts</p>
            <h1>Meetings</h1>
            <p className="headline-copy">
              {selectedAccount
                ? "Focused account view with leads, notes, and upcoming meetings."
                : showArchive
                  ? "Review and update archived meetings."
                  : "Scheduled meetings coming up in the next 7 days."}
            </p>
            {!selectedAccount && !showArchive ? (
              <div className="quote-inline">
                <p className="quote-text">"{dailyQuote.quote}"</p>
                <p className="meeting-notes quote-author">{dailyQuote.author}</p>
              </div>
            ) : null}
          </div>
          <div className="topbar-side">
            <div className="account-picker">
              <label className="section-kicker" htmlFor="account-view">
                Account
              </label>
              <select
                id="account-view"
                value={selectedAccount}
                onChange={(event) => {
                  setShowArchive(false);
                  setSelectedAccount(event.target.value);
                }}
              >
                <option value="">Select account</option>
                {accountLeads.map((account) => (
                  <option key={account.account} value={account.account}>
                    {account.account}
                  </option>
                ))}
              </select>
            </div>
            {!selectedAccount && !showArchive ? (
              <button className="ghost-button import-button" type="button" onClick={openImportPicker}>
                Import CSV
              </button>
            ) : null}
            {!selectedAccount && !showArchive ? (
              <div className="countdown-card compact-countdown">
                <p className="section-kicker">Quarter closes</p>
                <div className="countdown-grid">
                  <div>
                    <strong>{quarterCountdown.days}</strong>
                    <span>Days</span>
                  </div>
                  <div>
                    <strong>{quarterCountdown.hours}</strong>
                    <span>Hours</span>
                  </div>
                  <div>
                    <strong>{quarterCountdown.minutes}</strong>
                    <span>Minutes</span>
                  </div>
                  <div>
                    <strong>{quarterCountdown.seconds}</strong>
                    <span>Seconds</span>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="stat-strip">
              <StatCard label="Upcoming" value={upcomingCount} />
              <StatCard label="Follow-up" value={followUpCount} />
              <StatCard
                label="Archived"
                value={archivedCount}
                onClick={() => {
                  setSelectedAccount("");
                  setShowArchive(true);
                }}
                active={showArchive}
              />
            </div>
          </div>
        </section>

        <section className="toolbar">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search account, contact, email, notes"
          />
          <button className="ghost-button" type="button" onClick={connectCalendar}>
            {calendarToken ? "Reconnect Calendar" : "Connect Calendar"}
          </button>
          <button className="ghost-button" type="button" onClick={syncCalendar}>
            Sync Dates
          </button>
          <button className="ghost-button" type="button" onClick={connectGmail}>
            {gmailToken ? "Reconnect Gmail" : "Connect Gmail"}
          </button>
          <button className="ghost-button" type="button" onClick={syncGmail}>
            Sync Email
          </button>
        </section>

        <p className="status-line">{calendarStatus}</p>
        <p className="status-line">{gmailStatus}</p>
        {!selectedAccount && !showArchive && importStatus ? <p className="status-line">{importStatus}</p> : null}

        {!selectedAccount && !showArchive ? (
          <section className="compact-alert">
            <p className="section-kicker">Needs touch</p>
            {staleLeads.length ? (
              <div className="stale-list">
                {staleLeads.map((lead) => (
                  <div key={`${lead.account}-${lead.key}`} className="stale-row">
                    <span>
                      {lead.client} · {lead.account}
                    </span>
                    <span className="meeting-notes">
                      {businessDaysSince(lead.latestTouchpointTimestamp, now)} business days
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="meeting-notes">No leads need follow-up right now.</p>
            )}
          </section>
        ) : null}

        {selectedAccountDetail ? (
          <section className="card account-focus">
            <div className="card-heading">
              <div>
                <p className="section-kicker">Account view</p>
                <h2>{selectedAccountDetail.account}</h2>
              </div>
            </div>
            <div className="account-focus-grid">
              <div className="lead-list">
                {selectedAccountDetail.leads.length ? (
                  selectedAccountDetail.leads.map((lead) => (
                    <details key={lead.key} className="lead-card">
                      <summary className="lead-summary">
                        <div>
                          <p className="lead-name">{lead.client}</p>
                          <p className="meeting-notes">{lead.role ? `Title: ${lead.role}` : "Title: Not added"}</p>
                        </div>
                        <span className={`meeting-status ${statusClassName(lead.latestStatus)}`}>
                          {lead.latestStatus}
                        </span>
                      </summary>
                      <div className="lead-details">
                        <p className="meeting-notes">{lead.email || "No email"}</p>
                        <p className="meeting-notes">{lead.phone || "No phone"}</p>
                        <p className="meeting-notes">
                          Latest touchpoint: {lead.latestTouchpointType} on {lead.latestTouchpointDate}
                        </p>
                        <p className="meeting-notes">{lead.meetingCount} touchpoints</p>
                      </div>
                    </details>
                  ))
                ) : (
                  <div className="empty-state">No leads added yet.</div>
                )}
              </div>
              <div className="meeting-list">
                {scheduledMeetings.filter((meeting) => meeting.account === selectedAccountDetail.account).length ? (
                  scheduledMeetings
                    .filter((meeting) => meeting.account === selectedAccountDetail.account)
                    .map((meeting) => (
                      <MeetingEditor
                        key={`account-${meeting.id}`}
                        meeting={meeting}
                        onSave={saveMeeting}
                        onDelete={handleDelete}
                      />
                    ))
                ) : (
                  <div className="empty-state">No upcoming meetings for this account.</div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {!selectedAccount && !showArchive ? (
          <section className="dashboard-grid">
            <article className="card compact-card">
              <div className="card-heading">
                <div>
                  <p className="section-kicker">New</p>
                  <h2>Add meeting</h2>
                </div>
              </div>

              <form className="meeting-form compact-form" onSubmit={handleSubmit}>
                <select
                  required
                  value={form.account}
                  onChange={(event) => handleAccountChange(event.target.value)}
                >
                  <option value="">Select account</option>
                  {masterAccounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={selectedAccountLeads.some((lead) => lead.client === form.client) ? form.client : "__new__"}
                  onChange={(event) => handleLeadChange(event.target.value)}
                  disabled={!form.account}
                >
                  <option value="">{form.account ? "Select lead" : "Select account first"}</option>
                  {selectedAccountLeads.map((lead) => (
                    <option key={lead.key} value={lead.client}>
                      {lead.client}
                    </option>
                  ))}
                  {form.account ? <option value="__new__">Add new lead</option> : null}
                </select>
                {!selectedAccountLeads.some((lead) => lead.client === form.client) ? (
                  <input
                    required
                    value={form.client}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, client: event.target.value }))
                    }
                    placeholder="New lead name"
                  />
                ) : null}
                <input
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  placeholder="Title"
                />
                <input
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email"
                  type="email"
                />
                <div className="split-fields">
                  <input
                    required
                    type="date"
                    value={form.meetingDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, meetingDate: event.target.value }))
                    }
                  />
                  <input
                    required
                    type="time"
                    value={form.meetingTime}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, meetingTime: event.target.value }))
                    }
                  />
                </div>
                <select
                  value={form.touchpointType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      touchpointType: event.target.value as NonNullable<SheetMeeting["touchpointType"]>
                    }))
                  }
                >
                  <option value="Meeting">Meeting</option>
                  <option value="Email outreach">Email outreach</option>
                </select>
                <textarea
                  rows={3}
                  value={form.meetingNotes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, meetingNotes: event.target.value }))
                  }
                  placeholder="Notes"
                />
                <button className="primary-button" type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Add"}
                </button>
              </form>
            </article>

            <div className="stack-column">
              <article className="card list-card">
                <div className="card-heading">
                  <div>
                    <p className="section-kicker">Active</p>
                    <h2>Next 7 days</h2>
                  </div>
                </div>

                <div className="meeting-list">
                  {activeMeetings.length ? (
                    activeMeetings.map((meeting) => (
                      <MeetingEditor
                        key={meeting.id}
                        meeting={meeting}
                        onSave={saveMeeting}
                        onDelete={handleDelete}
                      />
                    ))
                  ) : (
                    <div className="empty-state">No meetings scheduled in the next 7 days.</div>
                  )}
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {!selectedAccount && showArchive ? (
          <section className="card account-focus archive-page">
            <div className="card-heading">
              <div>
                <p className="section-kicker">Archive</p>
                <h2>Past meetings</h2>
              </div>
            </div>

            <div className="meeting-list">
              {archivedMeetings.length ? (
                archivedMeetings.map((meeting) => (
                  <ArchivedMeetingEditor
                    key={meeting.id}
                    meeting={meeting}
                    onSave={saveMeeting}
                    onDelete={handleDelete}
                    hasUpcomingFollowUp={hasUpcomingFollowUp(meeting, meetings, now)}
                  />
                ))
              ) : (
                <div className="empty-state">No archived meetings yet.</div>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  onClick,
  active
}: {
  label: string;
  value: number;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`mini-stat ${onClick ? "mini-stat-button" : ""} ${active ? "mini-stat-active" : ""}`}
      type="button"
      onClick={onClick}
      disabled={!onClick}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </button>
  );
}

function MeetingEditor({
  meeting,
  onSave,
  onDelete
}: {
  meeting: SheetMeeting;
  onSave: (id: string, draft: MeetingDraft) => void;
  onDelete: (id: string) => void;
}) {
  const recentUpdateLinks = getRecentUpdateLinks(meeting);
  const [draft, setDraft] = useState<MeetingDraft>({
    meetingDate: meeting.meetingDate,
    meetingTime: meeting.meetingTime,
    touchpointType: meeting.touchpointType ?? "Meeting",
    meetingNotes: meeting.meetingNotes,
    nextSteps: meeting.nextSteps,
    status: meeting.status
  });

  useEffect(() => {
    setDraft({
      meetingDate: meeting.meetingDate,
      meetingTime: meeting.meetingTime,
      touchpointType: meeting.touchpointType ?? "Meeting",
      meetingNotes: meeting.meetingNotes,
      nextSteps: meeting.nextSteps,
      status: meeting.status
    });
  }, [
    meeting.meetingDate,
    meeting.meetingNotes,
    meeting.meetingTime,
    meeting.nextSteps,
    meeting.status,
    meeting.touchpointType
  ]);

  return (
    <article className="meeting-item">
      <div className="meeting-meta">
        <div>
          <p className="meeting-client">{meeting.account}</p>
          <p className="meeting-contact">{meeting.client}</p>
          <p className="meeting-notes">{meeting.email || "No email"}</p>
          <p className="meeting-notes">{meeting.phone || "No phone"}</p>
        </div>
        <span className={`meeting-status ${statusClassName(meeting.status)}`}>{meeting.status}</span>
      </div>

      <p className="meeting-datetime">{formatMeetingDate(meeting)}</p>

      {recentUpdateLinks.length ? (
        <div className="meeting-links">
          {recentUpdateLinks.map((link) => (
            <a
              key={link.href}
              className="meeting-link"
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}

      <div className="editor-grid">
        <input
          type="date"
          value={draft.meetingDate}
          onChange={(event) => setDraft((current) => ({ ...current, meetingDate: event.target.value }))}
        />
        <input
          type="time"
          value={draft.meetingTime}
          onChange={(event) => setDraft((current) => ({ ...current, meetingTime: event.target.value }))}
        />
        <select
          value={draft.touchpointType ?? "Meeting"}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              touchpointType: event.target.value as NonNullable<SheetMeeting["touchpointType"]>
            }))
          }
        >
          <option value="Meeting">Meeting</option>
          <option value="Email outreach">Email outreach</option>
        </select>
      </div>

      <div className="editor-grid editor-grid-status">
        <select
          value={draft.status}
          onChange={(event) =>
            setDraft((current) => ({ ...current, status: event.target.value as MeetingStatus }))
          }
        >
          <option value="Scheduled">Scheduled</option>
          <option value="Completed">Completed</option>
          <option value="Needs follow-up">Needs follow-up</option>
        </select>
      </div>

      <textarea
        rows={2}
        value={draft.meetingNotes}
        onChange={(event) => setDraft((current) => ({ ...current, meetingNotes: event.target.value }))}
        placeholder="Notes"
      />
      <textarea
        rows={2}
        value={draft.nextSteps}
        onChange={(event) => setDraft((current) => ({ ...current, nextSteps: event.target.value }))}
        placeholder="Next steps"
      />

      <div className="item-footer">
        <button className="primary-button" type="button" onClick={() => onSave(meeting.id, draft)}>
          Save
        </button>
        <button className="ghost-button" type="button" onClick={() => onDelete(meeting.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}

function ArchivedMeetingEditor({
  meeting,
  onSave,
  onDelete,
  hasUpcomingFollowUp
}: {
  meeting: SheetMeeting;
  onSave: (id: string, draft: MeetingDraft) => void;
  onDelete: (id: string) => void;
  hasUpcomingFollowUp: boolean;
}) {
  const [draft, setDraft] = useState<MeetingDraft>({
    meetingDate: meeting.meetingDate,
    meetingTime: meeting.meetingTime,
    touchpointType: meeting.touchpointType ?? "Meeting",
    meetingNotes: meeting.meetingNotes,
    nextSteps: meeting.nextSteps,
    status: meeting.status
  });

  useEffect(() => {
    setDraft({
      meetingDate: meeting.meetingDate,
      meetingTime: meeting.meetingTime,
      touchpointType: meeting.touchpointType ?? "Meeting",
      meetingNotes: meeting.meetingNotes,
      nextSteps: meeting.nextSteps,
      status: meeting.status
    });
  }, [
    meeting.meetingDate,
    meeting.meetingNotes,
    meeting.meetingTime,
    meeting.nextSteps,
    meeting.status,
    meeting.touchpointType
  ]);

  return (
    <details className="meeting-item archived-item archived-editor">
      <summary className="archived-summary">
        <div>
          <p className="meeting-client">{meeting.account}</p>
          <p className="meeting-contact">{meeting.client}</p>
          <p className="meeting-datetime archived-datetime">{formatMeetingDate(meeting)}</p>
        </div>
        <div className="archived-summary-meta">
          {hasUpcomingFollowUp ? <span className="follow-up-chip">Follow-up booked</span> : null}
          <span className="archive-chip">Archived</span>
        </div>
      </summary>

      <div className="archived-body">
        <p className="meeting-notes">Latest touchpoint: {meeting.touchpointType ?? "Meeting"}</p>
        <div className="editor-grid">
          <input
            type="date"
            value={draft.meetingDate}
            onChange={(event) => setDraft((current) => ({ ...current, meetingDate: event.target.value }))}
          />
          <input
            type="time"
            value={draft.meetingTime}
            onChange={(event) => setDraft((current) => ({ ...current, meetingTime: event.target.value }))}
          />
          <select
            value={draft.touchpointType ?? "Meeting"}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                touchpointType: event.target.value as NonNullable<SheetMeeting["touchpointType"]>
              }))
            }
          >
            <option value="Meeting">Meeting</option>
            <option value="Email outreach">Email outreach</option>
          </select>
        </div>

        <div className="editor-grid editor-grid-status">
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft((current) => ({ ...current, status: event.target.value as MeetingStatus }))
            }
          >
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
            <option value="Needs follow-up">Needs follow-up</option>
          </select>
        </div>

        <textarea
          rows={2}
          value={draft.meetingNotes}
          onChange={(event) => setDraft((current) => ({ ...current, meetingNotes: event.target.value }))}
          placeholder="Notes"
        />
        <textarea
          rows={2}
          value={draft.nextSteps}
          onChange={(event) => setDraft((current) => ({ ...current, nextSteps: event.target.value }))}
          placeholder="Next steps"
        />

        <div className="item-footer">
          <button className="primary-button" type="button" onClick={() => onSave(meeting.id, draft)}>
            Save
          </button>
          <button className="ghost-button" type="button" onClick={() => onDelete(meeting.id)}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

function getEventStart(start?: { date?: string; dateTime?: string }) {
  if (start?.dateTime) {
    const date = new Date(start.dateTime);
    return {
      meetingDate: date.toISOString().slice(0, 10),
      meetingTime: date.toTimeString().slice(0, 5)
    };
  }

  return {
    meetingDate: start?.date ?? "",
    meetingTime: "09:00"
  };
}

function eventMatchesMeeting(
  event: {
    summary?: string;
    description?: string;
    attendees?: Array<{ email?: string }>;
  },
  meeting: SheetMeeting
) {
  const haystack = [event.summary, event.description].filter(Boolean).join(" ").toLowerCase();
  const attendeeEmails = new Set(
    (event.attendees ?? []).map((attendee) => attendee.email?.toLowerCase()).filter(Boolean)
  );

  return (
    attendeeEmails.has(meeting.email.toLowerCase()) ||
    haystack.includes(meeting.client.toLowerCase()) ||
    haystack.includes(meeting.account.toLowerCase())
  );
}

function statusClassName(status: MeetingStatus) {
  if (status === "Scheduled") {
    return "status-scheduled";
  }

  if (status === "Needs follow-up") {
    return "status-follow-up";
  }

  return "status-completed";
}

function getRecentUpdateLinks(meeting: SheetMeeting) {
  const links: Array<{ label: string; href: string }> = [];
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const afterDate = oneYearAgo.toISOString().slice(0, 10);
  links.push({
    label: "Company update",
    href: `https://news.google.com/search?q=${encodeURIComponent(
      `${meeting.account} latest news after:${afterDate}`
    )}`
  });

  if (meeting.client.trim()) {
    links.push({
      label: "Lead update",
      href: `https://www.google.com/search?q=${encodeURIComponent(
        `${meeting.client} ${meeting.account} after:${afterDate}`
      )}`
    });
  }

  return links.slice(0, 2);
}

function isArchivedMeeting(meeting: SheetMeeting, now: Date) {
  return getMeetingDate(meeting) < now && meeting.status !== "Needs follow-up";
}

function isInNextSevenDays(meeting: SheetMeeting, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const meetingDate = getMeetingDate(meeting);
  return meetingDate >= start && meetingDate < end;
}

function hasUpcomingFollowUp(meeting: SheetMeeting, meetings: SheetMeeting[], now: Date) {
  const key = `${meeting.account}::${meeting.client}`.toLowerCase();

  return meetings.some(
    (candidate) =>
      `${candidate.account}::${candidate.client}`.toLowerCase() === key && getMeetingDate(candidate) >= now
  );
}

function buildAccountLeads(
  meetings: SheetMeeting[],
  allAccounts: readonly string[],
  emailActivity: Record<string, EmailActivity>
) {
  const accountMap = new Map<
    string,
    Map<
      string,
      {
        key: string;
        client: string;
        role: string;
        email: string;
        phone: string;
        meetingCount: number;
        latestStatus: MeetingStatus;
        latestTouchpointType: NonNullable<SheetMeeting["touchpointType"]> | "Gmail";
        latestTouchpointDate: string;
        latestTimestamp: number;
        latestTouchpointTimestamp: number;
      }
    >
  >();

  const masterIndex = new Map(allAccounts.map((account) => [normalizeAccountName(account), account]));
  const aliasMap = new Map<string, string>([
    ["je dunn", "JE Dunn Construction"],
    ["vitamin shoppe", "The Vitamin Shoppe"],
    ["tms", "tms"]
  ]);

  allAccounts.forEach((account) => {
    accountMap.set(account, new Map());
  });

  meetings.forEach((meeting) => {
    const accountKey = resolveAccountName(meeting.account.trim() || "Unknown account", masterIndex, aliasMap);
    const leadKey = `${accountKey}::${meeting.client.trim().toLowerCase()}`;
    const accountLeads = accountMap.get(accountKey) ?? new Map();
    const existing = accountLeads.get(leadKey);
    const timestamp = getMeetingDate(meeting).getTime();

    if (!existing) {
      accountLeads.set(leadKey, {
        key: leadKey,
        client: meeting.client,
        role: meeting.role,
        email: meeting.email,
        phone: meeting.phone,
        meetingCount: 1,
        latestStatus: meeting.status,
        latestTouchpointType: meeting.touchpointType ?? "Meeting",
        latestTouchpointDate: formatTouchpointDate(meeting),
        latestTimestamp: timestamp,
        latestTouchpointTimestamp: timestamp
      });
      accountMap.set(accountKey, accountLeads);
      return;
    }

    existing.meetingCount += 1;
    if (timestamp >= existing.latestTimestamp) {
      existing.role = meeting.role;
      existing.email = meeting.email;
      existing.phone = meeting.phone;
      existing.latestStatus = meeting.status;
      existing.latestTouchpointType = meeting.touchpointType ?? "Meeting";
      existing.latestTouchpointDate = formatTouchpointDate(meeting);
      existing.latestTimestamp = timestamp;
      existing.latestTouchpointTimestamp = timestamp;
    }
  });

  accountMap.forEach((leads) => {
    leads.forEach((lead) => {
      const activity = lead.email ? emailActivity[lead.email.toLowerCase()] : undefined;
      if (!activity || activity.timestamp < lead.latestTouchpointTimestamp) {
        return;
      }

      lead.latestTouchpointType = "Gmail";
      lead.latestTouchpointDate = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      }).format(new Date(activity.timestamp));
      lead.latestTouchpointTimestamp = activity.timestamp;
    });
  });

  return [...accountMap.entries()]
    .map(([account, leads]) => ({
      account,
      leadCount: leads.size,
      leads: [...leads.values()].sort((a, b) => a.client.localeCompare(b.client))
    }))
    .sort((a, b) => a.account.localeCompare(b.account));
}

function formatTouchpointDate(meeting: SheetMeeting) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(getMeetingDate(meeting));
}

function normalizeAccountName(value: string) {
  return value
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function mapImportedRow(row: string[], header: string[]) {
  const get = (...keys: string[]) => {
    const index = header.findIndex((cell) => keys.includes(cell));
    return index >= 0 ? row[index]?.trim() ?? "" : "";
  };

  const account = get("account", "account name");
  const client = get("client", "client name", "lead", "contact");

  if (!account || !client) {
    return null;
  }

  return {
    id: createId(account, client),
    account,
    client,
    role: get("role", "title"),
    email: get("email"),
    phone: get("phone", "phone #", "phone number"),
    meetingDate: get("meeting date", "date") || new Date().toISOString().slice(0, 10),
    meetingTime: get("meeting time", "time") || "09:00",
    touchpointType: (get("touchpoint type", "type") as SheetMeeting["touchpointType"]) || "Meeting",
    meetingNotes: get("meeting notes", "notes"),
    nextSteps: get("next steps"),
    status: (get("status") as SheetMeeting["status"]) || "Scheduled",
    source: "Sheet" as const
  };
}

function resolveAccountName(
  account: string,
  masterIndex: Map<string, string>,
  aliasMap: Map<string, string>
) {
  const normalized = normalizeAccountName(account);
  const aliased = aliasMap.get(normalized);
  if (aliased) {
    return aliased;
  }

  const direct = masterIndex.get(normalized);
  if (direct) {
    return direct;
  }

  for (const [key, value] of masterIndex.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return value;
    }
  }

  return account;
}

function businessDaysSince(timestamp: number, now: Date) {
  const start = new Date(timestamp);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  let days = 0;
  const current = new Date(start);
  while (current < end) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      days += 1;
    }
  }

  return days;
}

function getDailyQuote(now: Date) {
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

function getQuarterCountdown(now: Date) {
  const month = now.getMonth();
  const quarterEndMonth = month <= 2 ? 2 : month <= 5 ? 5 : month <= 8 ? 8 : 11;
  const quarterEnd = new Date(now.getFullYear(), quarterEndMonth + 1, 1, 0, 0, 0, 0);
  const diff = Math.max(0, quarterEnd.getTime() - now.getTime());
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: String(days),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0")
  };
}
