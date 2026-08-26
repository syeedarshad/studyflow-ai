import { Check } from "lucide-react";

const ITEMS = [
  "Windows 10 or later",
  "64-bit system required",
  "Internet connection for cloud Jass AI features",
  "Core planning and focus features remain available offline",
];

export default function Requirements() {
  return (
    <section className="reqs" aria-label="System requirements">
      <div className="container">
        <p className="eyebrow">System requirements</p>
        <ul>
          {ITEMS.map((item) => (
            <li key={item}>
              <Check size={15} aria-hidden /> {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
