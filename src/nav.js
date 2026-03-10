import { esc } from "./ui.js";

export function topNav(active = "") {
  const a = (href, label, key) =>
    `<a href="${href}" ${active === key ? 'style="background:#f6f6f6;color:#111;border:1px solid #e6e6e6;"' : ''}>${label}</a>`;
  return [
    a("/", "Home", "home"),
    a("/workout/start", "Nový", "workout"),
    a("/workouts", "Tréninky", "workouts"),
    a("/admin/exercises", "Cviky", "admin"),
    a("/admin/gyms", "Fitka", "gyms"),
    a("/admin/settings", "Nastavení", "settings"),
  ].join("");
}
