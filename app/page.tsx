"use client";

import Script from "next/script";
import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { masterAccounts } from "../lib/account-list";
import { SheetMeeting, sheetSeedData } from "../lib/sheet-data";

type MeetingStatus = SheetMeeting["status"];
type MeetingField = keyof Pick<
  SheetMeeting,
  "meetingDate" | "meetingTime" | "touchpointType" | "meetingNotes" | "nextSteps" | "status"
>;

const STORAGE_KEY = "client-meeting-dashboard";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

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

export default function Page() {
  const [meetings, setMeetings] = useState<SheetMeeting[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarStatus, setCalendarStatus] = useState("Calendar not connected.");
  const tokenClientRef = useRef<{
    requestAccessToken: (options?: { prompt?: string }) => void;
  } | null>(null);
  const deferredSearch = useDeferredValue(search);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    setMeetings(readStoredMeetings());
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  }, [hasHydrated, meetings]);

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

  const now = new Date();
  const weekMeetings = filteredMeetings.filter((meeting) => isInCurrentWeek(meeting, now));
  const activeMeetings = weekMeetings.filter((meeting) => !isArchivedMeeting(meeting, now));
  const archivedMeetings = [...filteredMeetings]
    .filter((meeting) => isArchivedMeeting(meeting, now))
    .sort((a, b) => getMeetingDate(b).getTime() - getMeetingDate(a).getTime());
  const accountLeads = useMemo(() => buildAccountLeads(meetings, masterAccounts), [meetings]);
  const upcomingCount = activeMeetings.filter((meeting) => getMeetingDate(meeting) >= now).length;
  const archivedCount = archivedMeetings.length;
  const followUpCount = activeMeetings.filter((meeting) => meeting.status === "Needs follow-up").length;

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
  }

  function updateMeeting(id: string, field: MeetingField, value: string) {
    startTransition(() => {
      setMeetings((current) =>
        current.map((meeting) => (meeting.id === id ? { ...meeting, [field]: value } : meeting))
      );
    });
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

  function handleDelete(id: string) {
    startTransition(() => {
      setMeetings((current) => current.filter((meeting) => meeting.id !== id));
    });
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={initializeGoogleClient}
      />
      <main className="page-shell">
        <section className="topbar">
          <div>
            <p className="eyebrow">OpenAI Accounts</p>
            <h1>Meetings</h1>
            <p className="headline-copy">Active calls stay visible. Past calls archive automatically.</p>
          </div>
          <div className="stat-strip">
            <StatCard label="Upcoming" value={upcomingCount} />
            <StatCard label="Follow-up" value={followUpCount} />
            <StatCard label="Archived" value={archivedCount} />
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
        </section>

        <p className="status-line">{calendarStatus}</p>

        <section className="dashboard-grid">
          <article className="card compact-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">New</p>
                <h2>Add meeting</h2>
              </div>
            </div>

            <form className="meeting-form compact-form" onSubmit={handleSubmit}>
              <input
                required
                value={form.account}
                onChange={(event) => setForm((current) => ({ ...current, account: event.target.value }))}
                placeholder="Account"
              />
              <input
                required
                value={form.client}
                onChange={(event) => setForm((current) => ({ ...current, client: event.target.value }))}
                placeholder="Client"
              />
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
                  <h2>This week</h2>
                </div>
              </div>

              <div className="meeting-list">
                {activeMeetings.length ? (
                  activeMeetings.map((meeting) => (
                    <MeetingEditor
                      key={meeting.id}
                      meeting={meeting}
                      onChange={updateMeeting}
                      onDelete={handleDelete}
                    />
                  ))
                ) : (
                  <div className="empty-state">No meetings scheduled for this week.</div>
                )}
              </div>
            </article>

            <article className="card list-card">
              <div className="card-heading">
                <div>
                  <p className="section-kicker">Accounts</p>
                  <h2>All accounts and leads</h2>
                </div>
              </div>

              <div className="account-list">
                {accountLeads.length ? (
                  accountLeads.map((account) => <AccountLeadCard key={account.account} account={account} />)
                ) : (
                  <div className="empty-state">No account leads found.</div>
                )}
              </div>
            </article>

            <article className="card list-card archive-card">
              <div className="card-heading">
                <div>
                  <p className="section-kicker">Archive</p>
                  <h2>Past meetings</h2>
                </div>
              </div>

              <div className="meeting-list">
                {archivedMeetings.length ? (
                  archivedMeetings.map((meeting) => (
                    <ArchivedMeeting
                      key={meeting.id}
                      meeting={meeting}
                      hasUpcomingFollowUp={hasUpcomingFollowUp(meeting, meetings, now)}
                    />
                  ))
                ) : (
                  <div className="empty-state">No archived meetings yet.</div>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function MeetingEditor({
  meeting,
  onChange,
  onDelete
}: {
  meeting: SheetMeeting;
  onChange: (id: string, field: MeetingField, value: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="meeting-item">
      <div className="meeting-meta">
        <div>
          <p className="meeting-client">{meeting.account}</p>
          <p className="meeting-contact">{meeting.client}</p>
        </div>
        <span className={`meeting-status ${statusClassName(meeting.status)}`}>{meeting.status}</span>
      </div>

      <p className="meeting-datetime">{formatMeetingDate(meeting)}</p>

      <div className="editor-grid">
        <input
          type="date"
          value={meeting.meetingDate}
          onChange={(event) => onChange(meeting.id, "meetingDate", event.target.value)}
        />
        <input
          type="time"
          value={meeting.meetingTime}
          onChange={(event) => onChange(meeting.id, "meetingTime", event.target.value)}
        />
        <select
          value={meeting.touchpointType ?? "Meeting"}
          onChange={(event) => onChange(meeting.id, "touchpointType", event.target.value)}
        >
          <option value="Meeting">Meeting</option>
          <option value="Email outreach">Email outreach</option>
        </select>
      </div>

      <div className="editor-grid editor-grid-status">
        <select
          value={meeting.status}
          onChange={(event) => onChange(meeting.id, "status", event.target.value)}
        >
          <option value="Scheduled">Scheduled</option>
          <option value="Completed">Completed</option>
          <option value="Needs follow-up">Needs follow-up</option>
        </select>
      </div>

      <textarea
        rows={2}
        value={meeting.meetingNotes}
        onChange={(event) => onChange(meeting.id, "meetingNotes", event.target.value)}
        placeholder="Notes"
      />
      <textarea
        rows={2}
        value={meeting.nextSteps}
        onChange={(event) => onChange(meeting.id, "nextSteps", event.target.value)}
        placeholder="Next steps"
      />

      <div className="item-footer">
        <span className="meeting-notes">{meeting.email || "No email"}</span>
        <button className="ghost-button" type="button" onClick={() => onDelete(meeting.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}

function ArchivedMeeting({
  meeting,
  hasUpcomingFollowUp
}: {
  meeting: SheetMeeting;
  hasUpcomingFollowUp: boolean;
}) {
  return (
    <article className="meeting-item archived-item">
      <div className="meeting-meta">
        <div>
          <p className="meeting-client">{meeting.account}</p>
          <p className="meeting-contact">{meeting.client}</p>
        </div>
        <span className="archive-chip">Archived</span>
      </div>
      <p className="meeting-datetime">{formatMeetingDate(meeting)}</p>
      <p className="meeting-notes">Latest touchpoint: {meeting.touchpointType ?? "Meeting"}</p>
      <p className="meeting-notes">{meeting.meetingNotes || "No notes."}</p>
      {hasUpcomingFollowUp ? <p className="follow-up-chip">Follow-up booked</p> : null}
    </article>
  );
}

function AccountLeadCard({
  account
}: {
  account: {
    account: string;
    leadCount: number;
      leads: Array<{
        key: string;
        client: string;
        role: string;
        email: string;
        meetingCount: number;
        latestStatus: MeetingStatus;
        latestTouchpointType: NonNullable<SheetMeeting["touchpointType"]>;
        latestTouchpointDate: string;
      }>;
  };
}) {
  return (
    <details className="account-card">
      <summary className="account-summary">
        <div>
          <p className="meeting-client">{account.account}</p>
          <p className="meeting-notes">{account.leadCount} leads tracked</p>
        </div>
      </summary>

      <div className="lead-list">
        {account.leads.length ? (
          account.leads.map((lead) => (
            <div key={lead.key} className="lead-row">
              <div>
                <p className="lead-name">{lead.client}</p>
                <p className="meeting-notes">
                  {lead.role ? `Title: ${lead.role}` : "Title: Not added"}
                </p>
                <p className="meeting-notes">
                  {lead.email || "No email"}
                </p>
                <p className="meeting-notes">
                  Latest touchpoint: {lead.latestTouchpointType} on {lead.latestTouchpointDate}
                </p>
              </div>
              <div className="lead-meta">
                <span className={`meeting-status ${statusClassName(lead.latestStatus)}`}>{lead.latestStatus}</span>
                <span className="meeting-notes">{lead.meetingCount} touchpoints</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">No leads added yet.</div>
        )}
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

function isArchivedMeeting(meeting: SheetMeeting, now: Date) {
  return getMeetingDate(meeting) < now && meeting.status !== "Needs follow-up";
}

function isInCurrentWeek(meeting: SheetMeeting, now: Date) {
  const start = new Date(now);
  const day = start.getDay();
  const diffToMonday = (day + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

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

function buildAccountLeads(meetings: SheetMeeting[], allAccounts: readonly string[]) {
  const accountMap = new Map<
    string,
    Map<
      string,
      {
        key: string;
        client: string;
        role: string;
        email: string;
        meetingCount: number;
        latestStatus: MeetingStatus;
        latestTouchpointType: NonNullable<SheetMeeting["touchpointType"]>;
        latestTouchpointDate: string;
        latestTimestamp: number;
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
        meetingCount: 1,
        latestStatus: meeting.status,
        latestTouchpointType: meeting.touchpointType ?? "Meeting",
        latestTouchpointDate: formatTouchpointDate(meeting),
        latestTimestamp: timestamp
      });
      accountMap.set(accountKey, accountLeads);
      return;
    }

    existing.meetingCount += 1;
    if (timestamp >= existing.latestTimestamp) {
      existing.role = meeting.role;
      existing.email = meeting.email;
      existing.latestStatus = meeting.status;
      existing.latestTouchpointType = meeting.touchpointType ?? "Meeting";
      existing.latestTouchpointDate = formatTouchpointDate(meeting);
      existing.latestTimestamp = timestamp;
    }
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
