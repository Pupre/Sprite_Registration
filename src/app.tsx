const principles = [
  "Ground anchor와 core body anchor를 분리해 추정한다.",
  "프레임 외곽의 일시적 이펙트는 낮은 가중치로 처리한다.",
  "프레임 단건 최적화가 아니라 시퀀스 단위 안정화를 수행한다.",
  "자동 보정 결과는 수동 미세 보정 UI로 즉시 이어질 수 있어야 한다."
];

const validationTargets = [
  "Idle 계열 synthetic 시퀀스에서 ground jitter가 감소해야 한다.",
  "Transient effect가 추가돼도 body anchor 추정이 크게 흔들리면 안 된다.",
  "의도된 y축 이동이 있는 시퀀스는 과도하게 평탄화되면 안 된다."
];

export function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Sprite Registration Studio</p>
        <h1>AI-generated sprite jitter needs registration, not just trimming.</h1>
        <p className="lede">
          The first implementation pass establishes the alignment core and its measurable
          validation criteria before the visual editor lands.
        </p>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Pipeline</h2>
          <ol>
            <li>Alpha or mask ingestion</li>
            <li>Stable core weighting</li>
            <li>Ground and body anchor estimation</li>
            <li>Offset search with effect tolerance</li>
            <li>Temporal stabilization with motion constraints</li>
          </ol>
        </article>

        <article className="panel">
          <h2>Principles</h2>
          <ul>
            {principles.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Validation Targets</h2>
          <ul>
            {validationTargets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
