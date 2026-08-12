/** HUD placeholder for a section page a later ticket replaces. */
export function SectionStub({ name }: { name: string }) {
  return (
    <div className="hud-stub">
      <div className="hud-mod">
        <h3 className="hud-h">
          MODULE // {name} <span className="dim">— AWAITING BUILD</span>
        </h3>
        <p className="hud-note">This section arrives in a later build slice.</p>
      </div>
    </div>
  )
}
