import { Mark } from "../shared/Mark";

export function Legend() {
  return (
    <div className="legend">
      <span><span className="lk" /> inherits</span>
      <span><Mark kind="double" /> excellent</span>
      <span><span className="lk dash" /> composes</span>
      <span><Mark kind="filled" /> made</span>
      <span><span className="lk dot" /> bake-off</span>
      <span><Mark kind="struck" /> needs work</span>
      <span><span className="rdot" style={{ marginLeft: 0, width: 22 }} /> over the lean line</span>
      <span><Mark kind="open" /> to-make</span>
    </div>
  );
}
