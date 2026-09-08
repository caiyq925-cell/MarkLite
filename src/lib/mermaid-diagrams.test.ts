import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}));

beforeAll(() => {
  (SVGElement.prototype as any).getBBox = function () {
    const len = (this as any).textContent?.length ?? 0;
    return { x: 0, y: 0, width: len * 8 || 20, height: 16 };
  };
  (Element.prototype as any).getComputedTextLength = function () {
    return (this.textContent?.length ?? 0) * 8 || 20;
  };
  (HTMLCanvasElement.prototype as any).getContext = function (kind: string) {
    if (kind !== "2d") return null;
    const canvas = this;
    return new Proxy({ canvas } as any, {
      get(t: any, p: string | symbol) {
        if (p in t) return t[p];
        if (p === "measureText")
          return (s: unknown) => ({
            width: String(s).length * 8,
            actualBoundingBoxAscent: 8,
            actualBoundingBoxDescent: 2,
          });
        if (typeof p === "symbol") return undefined;
        return (..._a: unknown[]) => undefined;
      },
      set(t: any, p: string | symbol, v: unknown) {
        t[p] = v;
        return true;
      },
    });
  };
  const origCS = window.getComputedStyle.bind(window);
  (window as any).getComputedStyle = (...args: Parameters<typeof origCS>) => {
    const s = origCS(...(args as [Element]));
    const gp = s.getPropertyValue.bind(s);
    s.getPropertyValue = ((name: string) => {
      const v = gp(name);
      if ((v === "" || v == null) && /^(padding|border|margin)/.test(name)) return "0px";
      return v;
    }) as typeof s.getPropertyValue;
    return s;
  };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
});

import { renderPreview } from "./preview";

const DIAGRAM_CASES: [string, string][] = [
  ["flowchart", "flowchart TB\n  A[开始] --> B{判断}\n  B -->|是| C[执行]\n  B -->|否| D[结束]"],
  ["graph", "graph LR\n  A-->B\n  B-->C\n  C-->A"],
  ["sequenceDiagram", "sequenceDiagram\n  Alice->>John: 你好\n  John-->>Alice: 回复\n  John->>John: 自言自语"],
  ["classDiagram", "classDiagram\n  Animal <|-- Duck\n  Animal: +int age\n  Animal: +voice() String"],
  ["classDiagram-v2", "classDiagram-v2\n  Animal <|-- Duck"],
  ["stateDiagram-v2", "stateDiagram-v2\n  [*] --> 静止\n  静止 --> 运动: 启动\n  运动 --> 静止: 停止\n  运动 --> [*]"],
  ["erDiagram", "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : contains\n  ORDER {\n    string name\n  }"],
  ["journey", "journey\n  title 我的假期\n  section 旅行\n    坐火车: 3: 小明\n    观光: 5: 小红"],
  ["gantt", "gantt\n  title 计划\n  dateFormat YYYY-MM-DD\n  section 开发\n    设计 :done, a1, 2026-01-01, 7d\n    编码 :active, 2026-01-08, 14d"],
  ["pie", "pie title 占比\n  \"A\" : 55\n  \"B\" : 45"],
  ["requirementDiagram", "requirementDiagram\n  requirement req1 {\n    id: \"REQ1\"\n    text: \"登录\"\n    risk: low\n    verifymethod: test\n  }\n  element web {\n    type: \"system\"\n  }\n  web - satisfies -> req1"],
  ["quadrantChart", "quadrantChart\n  title 定位\n  x-axis 低 --> 高\n  y-axis 差 --> 好\n  quadrant-1 重点\n  产品A: [0.3, 0.6]\n  产品B: [0.7, 0.8]"],
  ["timeline", "timeline\n  title 历史\n  section 早期\n    2020 : 事件A : 事件B\n  section 近期\n    2024 : 事件C"],
  ["gitGraph", "gitGraph\n  commit\n  branch dev\n  checkout dev\n  commit\n  checkout main\n  merge dev"],
  ["packet", "packet-beta\n  0-15: \"源端口\"\n  16-31: \"目标端口\"\n  32-63: \"序号\""],
  ["architecture", "architecture-beta\n  group api(cloud)[API]\n  service db(database)[数据库] in api\n  service net(internet)[Web] in api\n  net:R --> L:db"],
  ["sankey", "sankey-beta\nSource,Target,Value\nA,B,100\nB,C,40\nB,D,60"],
  ["xychart", "xychart-beta\n  title \"Sales Revenue\"\n  x-axis [jan, feb, mar, apr]\n  y-axis \"Revenue (in $)\" 4000 --> 11000\n  bar [5000, 6000, 7500, 8200]"],
  ["block", "block-beta\n  columns 1\n  a[\"A\"]\n  b[\"B\"]\n  a --> b"],
  ["C4Context", "C4Context\n  title 系统上下文\n  Person(user, \"用户\", \"使用者\")\n  System(app, \"应用\", \"核心应用\")\n  Rel(user, app, \"使用\")"],
  ["info", "info\n  title 信息"],
  ["radar", "radar-beta\n  title 评估\n  axis a[\"A\"], b[\"B\"], c[\"C\"], d[\"D\"]\n  max 100\n  curve c1[\"当前\"]{70, 60, 80, 40}"],
  ["venn", "venn-beta\n  set A [\"描述A\"]\n  set B [\"描述B\"]\n  union A,B"],
  ["ishikawa", "ishikawa-beta\n  鱼头问题\n    组一\n      因子一\n      因子二\n    组二\n      因子三"],
  ["kanban", "kanban-beta\n  todo[待办]\n    t1[任务一]\n  doing[进行中]\n    t2[任务二]"],
  ["swimlane", "swimlane-beta\n  A[开始] --> B{判断}\n  B -->|是| C[执行]"],
  ["wardley", "wardley-beta\n  title Test\n  component User [0.2, 0.5]\n  component System [0.8, 0.5]\n  User --> System"],
  ["treemap", "treemap-beta\n  \"根\" : 100\n  \"枝一\" : 60\n  \"枝二\" : 40"],
  ["treeView", "treeView-beta\n  \"根\" 100\n  \"子一\" 60\n  \"子二\" 40"],
  ["mindmap", "mindmap\n  root((中心))\n    分支一\n      叶1\n    分支二"],
  ["cynefin", "cynefin-beta\ntitle 框架\nclear\n\"步骤一\"\n\"步骤二\"\ncomplex\n\"模式识别\"\nchaotic\n\"即时响应\"\nclear --> complex: \"探索\""],
  ["eventmodeling", "eventmodeling\nentity cart\ndata cartData `json` {\n  \"id\": 1\n}\ntf 1 cmd cart\ntf 2 ui cart ->> 1\ngwt 2 given cmd cart when ui cart then cmd cart\nnote 2 {\n  \"dec\"\n}"],
  ["railroad", "railroad-beta\ntitle 语法图\nstart = sequence(terminal(\"GET\"), nonterminal(\"path\"), optional(choice(terminal(\"?\"), terminal(\"#\"))));"],
  ["abnf", "railroad-abnf-beta\n  rule = 1*( \"a\" / \"b\" ) ;"],
  ["ebnf", "railroad-ebnf-beta\n  rule ::= \"a\" | \"b\" ;"],
  ["peg", "railroad-peg-beta\n  rule <- \"a\" / \"b\" ;"],
];

describe("mermaid diagram rendering", () => {
  it("renders every official diagram type through the production pipeline", async () => {
    const failures: string[] = [];
    for (const [name, src] of DIAGRAM_CASES) {
      const md = "```mermaid\n" + src + "\n```";
      const html = await renderPreview(md, { docDir: null, blockRemote: true, dark: false });
      const errMsg = html.match(/图表渲染失败：([\s\S]*?)<\/pre>/)?.[1];
      if (!html.includes("<svg") || errMsg) {
        failures.push(`${name}: ${errMsg ?? "no <svg> output"}`);
      }
    }
    expect(failures, "failing diagram types").toEqual([]);
  }, 300_000);
});
