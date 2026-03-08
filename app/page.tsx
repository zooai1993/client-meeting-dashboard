"use client";

import Script from "next/script";
import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SheetMeeting, sheetSeedData } from "../lib/sheet-data";

type MeetingStatus = SheetMeeting["status"];

const STORAGE_KEY = "client-meeting-dashboard";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const defaultForm = {
  account: "",
  client: "",
  role: "",
  email: "",
  phone: "",
  meetingDate: "",
  meetingTime: "",
  status: "Scheduled" as MeetingStatus,
  meetingNotes: "",
  nextSteps: ""
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
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(getMeetingDate(meeting));
}

function formatToday() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());
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
  const [isPending, startTransition] = useTransition();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState("Google Calendar not connected.");
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
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
        meeting.role,
        meeting.email,
        meeting.phone,
        meeting.meetingNotes,
        meeting.nextSteps
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [deferredSearch, sortedMeetings]);

  const now = new Date();
  const upcomingMeetings = filteredMeetings.filter((meeting) => getMeetingDate(meeting) >= now);
  const followUps = meetings.filter((meeting) => meeting.status === "Needs follow-up");
  const completedMeetings = meetings.filter((meeting) => meeting.status === "Completed");
  const uniqueAccounts = new Set(meetings.map((meeting) => meeting.account));
  const calendarLinked = Boolean(calendarToken);

  function initializeGoogleClient() {
    if (!googleClientId || !window.google) {
      return;
    }

    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: GOOGLE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          setCalendarStatus("Google Calendar connection failed.");
          return;
        }

        setCalendarToken(response.access_token);
        setCalendarStatus("Google Calendar connected. Ready to sync.");
      }
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
      phone: form.phone.trim(),
      meetingDate: form.meetingDate,
      meetingTime: form.meetingTime,
      status: form.status,
      meetingNotes: form.meetingNotes.trim(),
      nextSteps: form.nextSteps.trim(),
      source: "Sheet"
    };

    startTransition(() => {
      setMeetings((current) => [...current, nextMeeting]);
      setForm(defaultForm);
    });
  }

  async function connectCalendar() {
    if (!googleClientId) {
      setCalendarStatus("Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google Calendar.");
      return;
    }

    if (!tokenClientRef.current) {
      setCalendarStatus("Google client is still loading.");
      return;
    }

    tokenClientRef.current.requestAccessToken({ prompt: "consent" });
  }

  async function syncCalendar() {
    if (!calendarToken) {
      setCalendarStatus("Connect Google Calendar before syncing.");
      return;
    }

    setCalendarStatus("Syncing calendar events...");

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", new Date().toISOString());
    url.searchParams.set("maxResults", "50");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${calendarToken}`
      }
    });

    if (!response.ok) {
      setCalendarStatus("Calendar sync failed. Check your Google OAuth client.");
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

          const { meetingDate, meetingTime } = getEventStart(matchedEvent.start);
          matches += 1;

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

    setCalendarStatus(
      matches
        ? `Calendar sync complete. Updated ${matches} ${matches === 1 ? "record" : "records"}.`
        : "Calendar sync complete. No matching events found."
    );
  }

  function handleDelete(id: string) {
    startTransition(() => {
      setMeetings((current) => current.filter((meeting) => meeting.id !== id));
    });
  }

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initializeGoogleClient} />
      <main className="page-shell">
        <header className="hero">
          <div className="hero-copy-block">
            <p className="eyebrow">Accounts and clients</p>
            <h1>Meeting Dashboard</h1>
            <p className="hero-copy">
              Structured around your prospecting sheet, with Google Calendar sync to auto-fill
              meeting dates for matching contacts.
            </p>
          </div>

          <div className="hero-panel">
            <p className="panel-label">Today</p>
            <p className="panel-date">{formatToday()}</p>
            <div className="hero-stats">
              <div>
                <span className="stat-value">{upcomingMeetings.length}</span>
                <span className="stat-label">Upcoming</span>
              </div>
              <div>
                <span className="stat-value">{followUps.length}</span>
                <span className="stat-label">Follow-ups</span>
              </div>
            </div>
          </div>
        </header>

        <section className="toolbar">
          <div>
            <p className="section-kicker">Quick access</p>
            <h2>Find an account instantly</h2>
          </div>
          <label className="search-field">
            <span className="sr-only">Search meetings</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by account, client, email, notes, or next step"
            />
          </label>
        </section>

        <section className="dashboard-grid">
          <article className="card sync-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">Calendar</p>
                <h2>Google Calendar sync</h2>
              </div>
            </div>

            <p className="sync-copy">
              Match upcoming calendar events against your sheet contacts by attendee email, client
              name, or account name.
            </p>
            <div className="sync-actions">
              <button className="primary-button" type="button" onClick={connectCalendar}>
                {calendarLinked ? "Reconnect Google Calendar" : "Connect Google Calendar"}
              </button>
              <button className="ghost-button" type="button" onClick={syncCalendar}>
                Sync meeting dates
              </button>
            </div>
            <p className="meeting-notes">{calendarStatus}</p>
          </article>

        <article className="card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Quick capture</p>
              <h2>Add a contact</h2>
            </div>
          </div>

          <form className="meeting-form" onSubmit={handleSubmit}>
            <label>
              Account
              <input
                required
                value={form.account}
                onChange={(event) => setForm((current) => ({ ...current, account: event.target.value }))}
                placeholder="Sage Hospitality Group"
              />
            </label>

            <label>
              Client name
              <input
                required
                value={form.client}
                onChange={(event) => setForm((current) => ({ ...current, client: event.target.value }))}
                placeholder="Daniel De Olmo"
              />
            </label>

            <label>
              Role
              <input
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                placeholder="CEO"
              />
            </label>

            <div className="split-fields">
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="contact@company.com"
                />
              </label>

              <label>
                Phone
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="555-123-4567"
                />
              </label>
            </div>

            <div className="split-fields">
              <label>
                Meeting date
                <input
                  required
                  type="date"
                  value={form.meetingDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, meetingDate: event.target.value }))
                  }
                />
              </label>

              <label>
                Meeting time
                <input
                  required
                  type="time"
                  value={form.meetingTime}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, meetingTime: event.target.value }))
                  }
                />
              </label>
            </div>

            <label>
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as MeetingStatus
                  }))
                }
              >
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Needs follow-up">Needs follow-up</option>
              </select>
            </label>

            <label>
              Meeting notes
              <textarea
                rows={4}
                value={form.meetingNotes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, meetingNotes: event.target.value }))
                }
                placeholder="Intro to CTO, renewal prep, budget review..."
              />
            </label>

            <label>
              Next steps
              <textarea
                rows={3}
                value={form.nextSteps}
                onChange={(event) =>
                  setForm((current) => ({ ...current, nextSteps: event.target.value }))
                }
                placeholder="Owners, deliverables, and follow-up timing."
              />
            </label>

            <button className="primary-button" type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save contact"}
            </button>
          </form>
        </article>

        <article className="card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Overview</p>
              <h2>Pipeline snapshot</h2>
            </div>
          </div>

          <div className="summary-list">
            <div className="summary-item">
              <div>
                <p>Active accounts</p>
                <p className="meeting-notes">Distinct clients in your dashboard</p>
              </div>
              <strong>{uniqueAccounts.size}</strong>
            </div>
            <div className="summary-item">
              <div>
                <p>Contacts tracked</p>
                <p className="meeting-notes">Every row imported from your sheet or added manually</p>
              </div>
              <strong>{meetings.length}</strong>
            </div>
            <div className="summary-item">
              <div>
                <p>Completed</p>
                <p className="meeting-notes">Calls and reviews already wrapped</p>
              </div>
              <strong>{completedMeetings.length}</strong>
            </div>
            <div className="summary-item">
              <div>
                <p>Needs follow-up</p>
                <p className="meeting-notes">Accounts that still need a next step</p>
              </div>
              <strong>{followUps.length}</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Upcoming</p>
              <h2>Next meetings</h2>
            </div>
          </div>

          <div className="meeting-list">
            {upcomingMeetings.length ? (
              upcomingMeetings.slice(0, 5).map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} onDelete={handleDelete} />
              ))
            ) : (
              <EmptyState message="No upcoming meetings match your current view." />
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">History</p>
              <h2>All meetings</h2>
            </div>
          </div>

          <div className="meeting-list">
            {filteredMeetings.length ? (
              [...filteredMeetings].reverse().map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} onDelete={handleDelete} />
              ))
            ) : (
              <EmptyState message="No meetings found. Adjust the search or add a new one." />
            )}
          </div>
        </article>
        </section>
      </main>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>;
}

function MeetingCard({
  meeting,
  onDelete
}: {
  meeting: SheetMeeting;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="meeting-item">
      <div className="meeting-meta">
        <div>
          <p className="meeting-client">{meeting.account}</p>
          <p className="meeting-contact">
            {meeting.client}
            {meeting.role ? `, ${meeting.role}` : ""}
          </p>
        </div>
        <span className={`meeting-status ${statusClassName(meeting.status)}`}>{meeting.status}</span>
      </div>

      <p className="meeting-datetime">{formatMeetingDate(meeting)}</p>
      <p className="meeting-focus">{meeting.email || "No email added."}</p>
      <p className="meeting-notes">{meeting.meetingNotes || "No notes yet."}</p>
      <p className="meeting-notes">{meeting.nextSteps || "No next steps yet."}</p>
      <p className="meeting-notes">Source: {meeting.source}</p>
      {meeting.calendarEventLink ? (
        <a className="meeting-link" href={meeting.calendarEventLink} target="_blank" rel="noreferrer">
          Open calendar event
        </a>
      ) : null}
      <button className="ghost-button" type="button" onClick={() => onDelete(meeting.id)}>
        Delete
      </button>
    </article>
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
  const haystack = [event.summary, event.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const attendeeEmails = new Set(
    (event.attendees ?? []).map((attendee) => attendee.email?.toLowerCase()).filter(Boolean)
  );

  return (
    attendeeEmails.has(meeting.email.toLowerCase()) ||
    haystack.includes(meeting.client.toLowerCase()) ||
    haystack.includes(meeting.account.toLowerCase())
  );
}
