import { formatDateKey, shiftDateKey, todayKey } from "./date";
import type { StatusEvent, Visit, VisitStatus } from "./visitLedger";

/**
 * A ledger with something in it, for looking at.
 *
 * An empty tool cannot be judged: paging, sorting, the day log and the calendar all look
 * identical to a blank page until there are rows. This builds a few weeks of the clinic's actual
 * rhythm — a batch goes into Unified Practice on a Monday, the week's claims go to Office Ally
 * on the Friday, the money lands a few weeks later — so the views show what they will really
 * show.
 *
 * It is never written to storage. See the preview banner on the ledger page: this data lives in
 * React state for as long as the tab is open, because the workspace is shared and loading
 * samples into it would put them on a colleague's screen too.
 */

const PEOPLE = [
  "Cici He",
  "Jonathan Zhu",
  "Dulce Arriaga",
  "Amara Okonkwo",
  "Tomas Vrabel",
  "Priya Raghavan",
  "Wen Li",
  "Marcus Ellery",
  "Noor Haddad",
  "Rosalind Achebe",
];

const AREAS = ["tag-seed-neck", "tag-seed-head", "tag-seed-back", "tag-seed-leg"];

/** Noon, so a date key survives any timezone the clinic's machines are set to. */
function at(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getTime();
}

/** The most recent Monday on or before today, so the weeks line up with a real calendar. */
function lastMonday(from: string): string {
  const [y, m, d] = from.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const back = (date.getDay() + 6) % 7;
  return formatDateKey(new Date(y, m - 1, d - back));
}

export interface SampleOptions {
  /** How many weeks back to go. Twelve weeks of ten people is enough to page at 50. */
  weeks?: number;
  today?: string;
}

export function buildSampleLedger({ weeks = 12, today = todayKey() }: SampleOptions = {}): Visit[] {
  const monday = lastMonday(today);
  const visits: Visit[] = [];
  let seq = 0;

  for (let week = weeks - 1; week >= 0; week -= 1) {
    const upDay = shiftDateKey(monday, -week * 7);
    const oaDay = shiftDateKey(upDay, 4);
    // Kaiser pays in a lump about three weeks later, which is what makes one remittance cover
    // visits from several different weeks.
    const payDay = shiftDateKey(upDay, 21);

    // Not everybody comes every week.
    const seen = PEOPLE.filter((_, i) => (week + i) % 3 !== 0);

    for (const name of seen) {
      seq += 1;
      const history: StatusEvent[] = [{ status: "new", at: at(upDay) }];
      let status: VisitStatus = "new";
      const visit: Visit = {
        id: `sample-${seq}`,
        name,
        visitDate: upDay,
        status,
        createdAt: at(upDay),
        serviceTag: AREAS[seq % AREAS.length],
        history,
      };

      // The most recent week is still sitting in the "not in UP yet" pile, the week before it
      // has been claimed but not paid, and everything older has come back — except a few.
      if (week >= 1) {
        status = "entered";
        visit.enteredDate = upDay;
        history.push({ status, at: at(upDay) });
      }
      if (week >= 1) {
        status = "submitted";
        visit.submittedDate = oaDay;
        history.push({ status, at: at(oaDay) });
      }
      if (week >= 4 && payDay <= today) {
        // One in nine comes back denied and has to go again.
        if (seq % 9 === 0) {
          status = "denied";
          history.push({ status, at: at(payDay) });
        } else {
          status = "paid";
          visit.paidDate = payDay;
          history.push({ status, at: at(payDay) });
        }
      }

      visit.status = status;
      visits.push(visit);
    }
  }

  return visits;
}
