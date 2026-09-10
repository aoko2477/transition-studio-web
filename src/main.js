import {
  frameTimes,
  frameTimesWithEndpoints,
  renderTransitionFrame,
  stingerTransitionPointMs,
} from "./frame-renderer.js";
import { encodeApng, encodePng, encodeSolidPng, encodeZip } from "./media-encoders.js";
import { analyzeFrames, decodeAnimation } from "./media-inspector.js";
import {
  COMPOUND_RECIPES,
  evaluateRecipe,
  seededUnit,
} from "./transition-recipes.js";
import { encodeAnimatedWebp, encodeAnimatedWebpToTarget } from "./webp-browser-encoder.js";

const app = document.querySelector("#app");

app.innerHTML = `
  <header class="topbar">
    <div>
      <h1>Transition Studio</h1>
      <p>トランジション素材の作成・検査・容量最適化</p>
    </div>
    <span id="editionBadge" class="badge">v0.2 Beta</span>
  </header>

  <nav class="tabs" aria-label="主要機能">
    <button class="tab active" data-view="editor">設定</button>
    <button class="tab" data-view="inspect">検査</button>
    <button class="tab" data-view="about">使い方・ライセンス</button>
  </nav>

  <main>
    <section id="editor" class="view active">
      <div class="layout" id="editorLayout">
        <aside class="panel controls">
          <div class="section-heading"><span>01</span><h2>トランジション</h2></div>
          <label>プリセット
            <select id="kind">
              <optgroup label="基本">
                <option value="fade">フェード</option>
                <option value="wipe">ワイプ</option>
                <option value="split">スプリット</option>
                <option value="blink">まばたき</option>
                <option value="iris">アイリス</option>
                <option value="stripe">ストライプ</option>
                <option value="tile">タイル</option>
                <option value="radial">ラジアル</option>
                <option value="zoom">ズーム</option>
              </optgroup>
              <optgroup label="多層">
                <option value="multi-iris">多層アイリス</option>
              </optgroup>
              <optgroup label="実験中">
                <option value="compound-fogFill">霧・フィル β</option>
                <option value="compound-fogSweep">霧・スイープ β</option>
                <option value="compound-fogBloom">霧・ブルーム β</option>
              </optgroup>
            </select>
          </label>
          <p class="preset-summary" id="presetSummary"></p>
          <div id="fogControls" class="is-hidden">
            <div class="warning"><strong>実験中：</strong>霧パターンは見た目・容量・速度を比較するための試作です。</div>
            <label>霧の大きさ <input id="fogScale" type="range" min="1" max="8" step="0.1" value="3.4" /><output id="fogScaleValue">3.4</output></label>
            <label>霧の濃さ <input id="fogDensity" type="range" min="0" max="100" step="1" value="55" /><output id="fogDensityValue">55</output></label>
            <label>揺らぎ <input id="fogTurbulence" type="range" min="0" max="100" step="1" value="58" /><output id="fogTurbulenceValue">58</output></label>
            <label>縁の柔らかさ <input id="fogFeather" type="range" min="0" max="100" step="1" value="18" /><output id="fogFeatherValue">18</output></label>
            <label>流れ <input id="fogDrift" type="range" min="0" max="1.5" step="0.01" value="0.48" /><output id="fogDriftValue">0.48</output></label>
            <label>Seed <input id="fogSeed" type="number" min="0" max="2147483647" step="1" value="8127" /></label>
          </div>
          <label id="blinkPatternControl">まばたき動作
            <select id="blinkPattern"><option value="single">ゆっくり閉じる</option><option value="double">1回ぱちっ → 本閉じ</option></select>
            <small id="blinkTimingHint">推奨：ゆっくり閉じ1.5秒・保持0.1秒・開き1.8秒</small>
          </label>
          <label id="blinkBalanceControl">まぶたの上下比率
            <select id="blinkBalance"><option value="center" selected>中央（上50：下50）</option><option value="natural">人のまぶたを意識（上56：下44）</option></select>
          </label>
          <label id="blinkFeatherControl">境界のぼかし幅（画像の縦幅に対する割合）
            <div class="range-number-row">
              <input id="blinkFeatherSlider" type="range" min="0" max="10" step="0.1" value="0.6" />
              <div class="number-with-unit"><input id="blinkFeather" type="number" min="0" max="10" step="0.1" value="0.6" /><span>%</span></div>
            </div>
          </label>
          <p class="note" id="blinkEffectNote">書き出される効果は幕・マスク部分だけです。背景シーン自体のぼかし・拡大・揺れは含まれません。</p>
          <label id="colorControl">色 <input id="color" type="color" value="#000000" /></label>
          <label id="durationControl">変化時間 <div class="number-with-unit"><input id="duration" type="number" min="0.1" max="10" step="0.1" value="1.0" /><span>秒</span></div><span id="durationValue">1.0秒</span></label>
          <label><span id="easingLabel">動き方</span>
            <select id="easing">
              <option value="linear" selected>一定</option><option value="ease">なめらか</option><option value="ease-in">ゆっくり開始</option><option value="ease-out">ゆっくり終了</option><option value="ease-in-out">ゆっくり開始・終了</option>
              <option value="custom" hidden>カスタム曲線</option>
            </select>
          </label>
          <div class="easing-editor">
            <svg id="easingGraph" viewBox="0 0 240 120" role="img" aria-label="補間曲線。二つのアンカーをドラッグして編集できます">
              <path class="easing-grid" d="M14 14V106H226M14 60H226M120 14V106" />
              <path id="easingHandleLines" class="easing-handles" />
              <path id="easingPath" class="easing-path" />
              <circle id="easingPoint1" class="easing-point" r="6" tabindex="0" />
              <circle id="easingPoint2" class="easing-point" r="6" tabindex="0" />
            </svg>
            <div class="easing-values"><span>進行 0%</span><code id="easingCode">cubic-bezier(.42, 0, .58, 1)</code><span>進行 100%</span></div>
          </div>
          <div id="opacityModeControl" class="mode-control"><span class="control-title">透明度の変化</span>
            <div class="mode-switch" id="opacityModeSwitch" role="group" aria-label="透明度の変化">
              <button type="button" data-opacity-mode="cover" title="OUT：透明な状態から指定色で画面を覆います。シーンを隠す側の素材です。">OUT<small>透明 → 指定色</small></button>
              <button type="button" data-opacity-mode="reveal" title="IN：指定色で覆われた状態から透明になります。次のシーンを見せる側の素材です。">IN<small>指定色 → 透明</small></button>
              <button type="button" data-opacity-mode="roundtrip" title="OBS：入り・全面を覆う保持区間・抜けを1本のアニメーションとして作成します。現在の書き出し形式はWebP・APNG・PNG連番で、OBS向けWebMは未対応です。">OBS<small>入り → 保持 → 抜け</small></button>
            </div>
            <select id="opacityMode" hidden aria-hidden="true">
              <option value="roundtrip">OBS向け：透明 → 指定色 → 透明</option>
              <option value="cover" selected>ココフォリア向け：透明 → 指定色</option>
              <option value="reveal">ココフォリア向け：指定色 → 透明</option>
              <option value="custom">カスタム：開始透明度 → 終了透明度</option>
            </select>
            <small class="mode-hint" id="opacityModeHint">3素材セットではOUT・固定画像・INをまとめて書き出します。</small>
            <label class="check-control" id="adjustOpacityControl"><input id="adjustOpacity" type="checkbox" /> 開始・終了の不透明度を個別調整</label>
          </div>
          <div class="opacity-controls" id="opacityControls">
            <label>開始時の不透明度 <input id="startOpacity" type="number" min="0" max="100" value="0" /> <span id="startOpacityValue">0%</span></label>
            <label>終了時の不透明度 <input id="endOpacity" type="number" min="0" max="100" value="100" /> <span id="endOpacityValue">100%</span></label>
          </div>
          <label class="check-control" id="forceOpaqueControl"><input id="forceOpaque" type="checkbox" checked /> 図形を常に100%不透明で描画</label>
          <div class="obs-controls" id="obsControls">
            <small id="obsFormatHint" class="mode-hint">現在はWebP・APNG・PNG連番で書き出します。OBS向けWebMはローカル版に実装予定です。「入り → 保持 → 抜け」の連続素材として利用できます。</small>
            <div class="timing-inputs">
              <label>入り <input id="enterDuration" type="number" min="0.1" max="10" step="0.1" value="1.0" /></label>
              <label>黒幕保持 <input id="holdDuration" type="number" min="0" max="10" step="0.1" value="2.0" /></label>
              <label>抜け <input id="exitDuration" type="number" min="0.1" max="10" step="0.1" value="1.0" disabled /></label>
            </div>
            <label class="check-control timing-match"><input id="matchExitDuration" type="checkbox" checked /> 抜け時間を入り時間と一致</label>
            <label class="check-control"><input id="advancedTimeline" type="checkbox" /> タイムラインで透明度を詳細編集</label>
            <div class="timeline-opacity-controls is-hidden" id="timelineOpacityControls">
              <div class="timing-inputs">
                <label>開始 <input id="timelineStartOpacity" type="number" min="0" max="100" step="1" value="0" /></label>
                <label>黒幕不透明度 <input id="timelineCoverOpacity" type="number" min="0" max="100" step="1" value="100" /></label>
                <label>終了 <input id="timelineEndOpacity" type="number" min="0" max="100" step="1" value="0" disabled /></label>
              </div>
              <label class="check-control timing-match"><input id="matchTimelineEndOpacity" type="checkbox" checked /> 終了の不透明度を開始と一致</label>
            </div>
            <div class="timing-bar" aria-label="OBSトランジションの時間配分">
              <span id="enterSegment"><b>入り</b><small id="enterSegmentValue">1.0秒</small></span>
              <span id="holdSegment"><b>保持</b><small id="holdSegmentValue">2.0秒</small></span>
              <span id="exitSegment"><b>抜け</b><small id="exitSegmentValue">1.0秒</small></span>
            </div>
            <p class="timing-total" id="timingTotal">合計 4.0秒</p>
            <label class="check-control"><input id="customExitEasing" type="checkbox" /> 抜け側の補間曲線を個別設定</label>
            <div class="exit-easing-control is-hidden" id="exitEasingControl">
              <label>抜け側の動き方
                <select id="exitEasing">
                  <option value="linear">一定</option><option value="ease">なめらか</option><option value="ease-in">ゆっくり開始</option><option value="ease-out">ゆっくり終了</option><option value="ease-in-out" selected>ゆっくり開始・終了</option>
                  <option value="custom" hidden>カスタム曲線</option>
                </select>
              </label>
              <div class="easing-editor">
                <svg id="exitEasingGraph" viewBox="0 0 240 120" role="img" aria-label="抜け側の補間曲線。二つのアンカーをドラッグして編集できます">
                  <path class="easing-grid" d="M14 14V106H226M14 60H226M120 14V106" />
                  <path id="exitEasingHandleLines" class="easing-handles" />
                  <path id="exitEasingPath" class="easing-path" />
                  <circle id="exitEasingPoint1" class="easing-point" r="6" tabindex="0" />
                  <circle id="exitEasingPoint2" class="easing-point" r="6" tabindex="0" />
                </svg>
                <div class="easing-values"><span>進行 0%</span><code id="exitEasingCode">cubic-bezier(.42, 0, .58, 1)</code><span>進行 100%</span></div>
              </div>
            </div>
            <p class="derived-easing" id="derivedExitEasing"></p>
            <label id="exitStyleControl">黒幕の抜け方
              <select id="exitStyle"><option id="continueExitOption" value="continue">そのまま進んで抜ける</option><option value="fade">その場でフェードアウト</option><option value="reverse">逆再生で戻る</option></select>
            </label>
          </div>
          <label id="countControl">分割数 <input id="count" type="number" min="1" max="64" value="8" /></label>
          <label id="stripeStaggerControl">ストライプの開始ずれ
            <div class="range-number-row">
              <input id="stripeStaggerSlider" type="range" min="0" max="50" step="1" value="22" />
              <div class="number-with-unit"><input id="stripeStagger" type="number" min="0" max="50" step="1" value="22" /><span>%</span></div>
            </div>
            <small>最初と最後の帯が動き始める時間差です。0%で同時、値を上げるほど順番がはっきりします。</small>
          </label>
          <label id="stripeStaggerPatternControl">ストライプのずれ方
            <select id="stripeStaggerPattern"><option value="linear">一定間隔</option><option value="ease">なめらかな間隔</option><option value="alternating">1本おきに交互</option><option value="random">ランダム風（固定）</option></select>
            <small>帯の移動速度ではなく、各帯が動き始める順番と間隔を変えます。</small>
          </label>
          <label id="tileDirectionControl">タイルの展開方向
            <select id="tileDirection"><option value="top-down">上 → 下</option><option value="bottom-up">下 → 上</option><option value="left-right">左 → 右</option><option value="right-left">右 → 左</option><option value="top-left">左上 → 右下</option><option value="top-right">右上 → 左下</option><option value="center-out">中央 → 外側</option><option value="outside-in">外側 → 中央</option></select>
          </label>
          <label id="directionControl"><span id="directionLabel">方向</span>
            <select id="direction"><option value="right">→</option><option value="left">←</option><option value="down">↓</option><option value="up">↑</option></select>
          </label>
          <div id="wipeAngleControl" class="angle-control">
            <span class="control-title">ワイプ角度</span>
            <div class="direction-switch" id="wipeDirectionSwitch" role="group" aria-label="ワイプ方向">
              <button type="button" data-angle="270">↑</button><button type="button" data-angle="0">→</button><button type="button" data-angle="90">↓</button><button type="button" data-angle="180">←</button>
            </div>
            <label>角度 <div class="number-with-unit"><input id="wipeAngle" type="number" min="0" max="359" step="1" value="0" /><span>°</span></div></label>
          </div>
          <label id="irisDirectionControl">アイリスの方向
            <select id="irisDirection"><option value="inside-out">中心から外側へ</option><option value="outside-in">外側から中心へ</option></select>
          </label>
          <label id="irisTimingControl">アイリスの広がり方
            <select id="irisTiming"><option value="standard">標準</option><option value="linear">線形</option><option value="soft-accelerated">なだらかに加速</option><option value="accelerated">しっかり加速</option></select>
          </label>
          <div id="multiIrisControl" class="sub-controls">
            <span class="control-title">多層アイリス</span>
            <label>層数 <input id="multiIrisLayers" type="number" min="2" max="4" step="1" value="4" /></label>
            <label>層の時間差 <div class="number-with-unit"><input id="multiIrisStagger" type="number" min="0" max="18" step="1" value="8" /><span>%</span></div></label>
            <div class="color-row" aria-label="多層アイリスの差し色">
              <label>差し色1 <input id="multiIrisColor1" type="color" value="#243b78" /></label>
              <label>差し色2 <input id="multiIrisColor2" type="color" value="#6d3bb8" /></label>
              <label>差し色3 <input id="multiIrisColor3" type="color" value="#c64f82" /></label>
            </div>
            <small>最後の層には上の「色」を使います。配色・層数・時間差を変更できます。</small>
          </div>
          <label id="edgeFeatherControl">移動境界のぼかし幅
            <div class="range-number-row">
              <input id="edgeFeatherSlider" type="range" min="0" max="5" step="0.1" value="0.2" />
              <div class="number-with-unit"><input id="edgeFeather" type="number" min="0" max="5" step="0.1" value="0.2" /><span>%</span></div>
            </div>
            <small>出力画像の高さに対する割合。ワイプ／スプリット／ストライプの動いている境界だけに適用します。</small>
          </label>
          <label id="zoomDirectionControl">ズームの方向
            <select id="zoomDirection"><option value="center-out">中央から外側へ</option><option value="outside-in">外側から中央へ</option></select>
          </label>
          <label id="radialStartControl">ラジアル開始角度
            <select id="radialStart"><option value="0">0°・上</option><option value="90">90°・右</option><option value="180">180°・下</option><option value="270">270°・左</option></select>
          </label>
          <label id="radialDirectionControl">ラジアル回転方向
            <select id="radialDirection"><option value="clockwise">時計回り</option><option value="counterclockwise">反時計回り</option></select>
          </label>
          <label id="edgeControl">端補完
            <select id="edge"><option>透明</option><option>単色</option><option>端を引き伸ばす</option><option>鏡像</option><option>ぼかして延長</option><option>タイル</option></select>
          </label>
          <div class="project-actions"><button id="savePreset">設定をJSON保存</button><label class="button-label">設定を読込<input id="loadPreset" type="file" accept="application/json,.json" /></label></div>
        </aside>
        <section class="panel stage-panel">
          <div class="stage-toolbar">
            <div><span class="eyebrow">PREVIEW</span><strong id="previewTitle">フェード</strong></div>
            <div class="preview-toolbar-actions">
              <label>背景
                <select id="previewBackground">
                  <option value="scene">サンプルシーン</option><option value="checker">市松模様</option><option value="white">白</option><option value="black">黒</option><option value="gray">グレー</option><option value="custom">任意色</option>
                </select>
              </label>
              <input id="previewBackgroundColor" class="is-hidden" type="color" value="#406080" aria-label="プレビュー背景色" />
              <label class="preview-fps-control"><input id="previewMatchFps" type="checkbox" /> 書き出しFPSで表示</label>
              <button id="exportDockToggle" class="toolbar-toggle" type="button" aria-pressed="false" hidden>書き出しを右に表示</button>
              <button id="play">↻ 最初から</button>
            </div>
          </div>
          <div class="checker stage" id="stage">
            <div class="stage-backdrop"><span>SCENE A</span><strong>Transition Studio</strong><small>1920 × 1080 preview</small></div>
            <canvas id="compoundCanvas" class="compound-canvas" aria-label="複合トランジション描画"></canvas>
            <div id="transitionLayer" class="transition-layer"></div>
          </div>
          <div class="preview-transport">
            <button id="previewToggle">一時停止</button>
            <div class="preview-timeline" id="previewTimeline">
              <svg id="previewTimelineGraph" viewBox="0 0 1000 86" preserveAspectRatio="none" aria-label="入り、保持、抜けと透明度の推移">
                <rect id="timelineEnterArea" class="timeline-area enter" y="0" height="86" />
                <rect id="timelineHoldArea" class="timeline-area hold" y="0" height="86" />
                <rect id="timelineExitArea" class="timeline-area exit" y="0" height="86" />
                <path id="timelineCurve" class="timeline-curve" />
                <line id="timelineTransitionPoint" class="timeline-transition-point is-hidden" y1="0" y2="86" />
                <text id="timelineTransitionPointLabel" class="timeline-transition-point-label is-hidden" y="82">TP</text>
                <line id="timelinePlayhead" class="timeline-playhead" y1="0" y2="86" />
                <circle id="timelineStartPoint" class="timeline-point" r="7" />
                <circle id="timelineCoverPoint" class="timeline-point" r="7" />
                <circle id="timelineEndPoint" class="timeline-point" r="7" />
                <text id="timelineEnterLabel" class="timeline-label" y="15">入り</text>
                <text id="timelineHoldLabel" class="timeline-label" y="15">保持</text>
                <text id="timelineExitLabel" class="timeline-label" y="15">抜け</text>
              </svg>
              <input id="previewSeek" type="range" min="0" max="1000" step="1" value="0" aria-label="プレビュー再生位置" />
            </div>
            <output id="previewTime">0.00 / 0.00秒</output>
          </div>
          <div class="metrics">
            <span>開始</span><span class="safe" id="coverageStatus">全面被覆／安全な切替区間</span><span>終了</span>
          </div>
          <div id="integratedSetPreviewDock" class="integrated-set-preview-dock" hidden></div>
        </section>
        <aside id="integratedExportDock" class="panel integrated-export-dock" hidden></aside>
      </div>
    </section>

    <section id="inspect" class="view">
      <div class="panel">
        <h2>アニメーション検査</h2>
        <div class="warning"><strong>外部素材を読み込む前に：</strong>第三者が制作した素材は、利用規約・ライセンスで改変が許可されていることを各自で確認してください。利用・改変・再配布は利用者自身の責任です。</div>
        <label class="drop" id="inspectDropZone">Animated WebP / APNG を選択またはここへドロップ
          <input id="inspectFile" type="file" accept="image/webp,image/apng,image/png,.webp,.apng" />
        </label>
        <div id="fileInfo" class="file-info">ファイル未選択</div>
        <div class="inspector-grid">
          <div class="checker inspector-stage"><canvas id="inspectorCanvas"></canvas></div>
          <div>
            <h3>チェック項目</h3>
            <ul class="check-list" id="inspectionResults"><li>ファイルを選択してください</li></ul>
            <div class="inspector-controls"><button id="inspectFirst">|◀</button><button id="inspectPrev">◀</button><button id="inspectPlay">再生</button><button id="inspectNext">▶</button><button id="inspectLast">▶|</button></div>
            <label class="check-row" title="オンでは末尾から先頭へ戻って再生を続けます。オフでは末尾で停止します。"><input id="inspectLoop" type="checkbox" checked /> 自動ループ</label>
            <output id="inspectPosition">0 / 0</output>
            <small>← / → キーで1コマ移動</small>
            <label>表示背景 <select id="inspectBackground"><option value="checker">市松</option><option value="black">黒</option><option value="white">白</option></select></label>
            <div class="inspector-controls"><button id="trimLeading">先頭透明を除外</button><button id="trimTrailing">末尾透明を除外</button></div>
            <div class="inspector-save-actions"><button id="saveTrimmed" disabled>トリム結果をAPNG保存</button><button id="saveTrimmedWebp" disabled>トリム結果をWebP保存</button></div>
          </div>
        </div>
        <div class="timeline frame-timeline" id="frameTimeline"></div>
      </div>
    </section>

    <section id="export" class="view">
      <div class="panel export-grid" id="exportGrid">
        <div id="exportSettings" class="export-settings">
          <h2>書き出し</h2>
          <label title="用途に合う保存形式を選びます。CCFOLIAではOUT・HOLD・INをまとめた3素材セットがおすすめです。">形式 <select id="exportFormat"><option value="webp">Animated WebP</option><option value="ccfset-webp" selected>3素材セット・Animated WebP（ZIP）</option><option value="apng">APNG</option><option value="ccfset-apng">3素材セット・APNG（ZIP）</option><option value="pngzip">PNG連番（ZIP）</option><option id="webmOption" value="webm" disabled>WebM（ローカル版に実装予定）</option></select></label>
          <div id="formatCompatibility" class="note"></div>
          <div id="localOutputControl" class="local-output-control" hidden>
            <label title="ローカル版では、ZIPやブラウザのダウンロードを介さず、選択したフォルダへファイルを直接保存できます。">保存方法
              <select id="exportDestination">
                <option value="download" selected>ブラウザからダウンロード</option>
                <option value="folder">選択フォルダへ直接保存（ZIPなし）</option>
              </select>
            </label>
            <button id="chooseExportDirectory" type="button">出力先フォルダを選択</button>
            <small id="exportDirectoryStatus" class="field-help">出力時にフォルダを選択します。同名ファイルは上書きせず連番を付けます。</small>
          </div>
          <label title="出力先に合わせた幅・高さをまとめて設定します。軽量プリセットは容量を抑えたい場合に向きます。">解像度プリセット <select id="resolutionPreset"><option value="1920x1080">Full HD・1920×1080</option><option value="1280x720">HD・1280×720</option><option value="960x540" selected>軽量16:9・960×540</option><option value="640x360">小型16:9・640×360</option><option value="3840x2160">4K・3840×2160</option><option value="1080x1080">正方形・1080×1080</option><option value="1000x1000">正方形・1000×1000</option><option value="custom">カスタム</option></select></label>
          <div class="export-dimensions"><label title="書き出す画像の横幅です。大きいほど細部を保てますが容量が増えます。">幅 <input id="exportWidth" type="number" min="64" max="3840" step="2" value="960"></label><label title="書き出す画像の高さです。大きいほど細部を保てますが容量が増えます。">高さ <input id="exportHeight" type="number" min="64" max="2160" step="2" value="540"></label><label title="1秒あたりのフレーム数です。30fpsは容量とのバランス、60fpsは滑らかさを優先します。">FPS <input id="exportFps" type="number" min="5" max="60" value="30"></label></div>
          <small class="field-help" title="FPSを上げるほどフレーム数が増えるため、同じ画質・解像度ではファイル容量も増えやすくなります。">30fps：標準・容量を抑えやすい ／ 60fps：よりなめらか・容量増</small>
          <label id="exportTargetControl" title="Animated WebPの目標容量です。1MBは安全余裕を含む約950KiBを目標にします。3素材セットではOUTとINを別々に判定し、HOLDは含めません。">容量 <select id="exportTarget"><option value="1mb" selected>1MB</option><option value="5mb">5MB</option><option value="unlimited">制限なし</option><option value="custom">任意設定</option></select></label>
          <label id="customTargetControl" hidden>任意の上限（MiB） <input id="exportCustomTarget" type="number" min="0.1" max="100" step="0.1" value="1"></label>
          <label id="optimizationPriorityControl" title="容量上限へ収める際、画質・滑らかさ・解像度のどれを優先するか指定します。">最適化方針 <select id="exportPriority"><option value="auto" title="画質・FPS・画像サイズをバランスよく調整">自動</option><option value="quality" title="圧縮品質を優先し、必要に応じてFPS・画像サイズを下げる">画質優先</option><option value="fps" title="動きの滑らかさを優先し、圧縮品質・画像サイズを調整">FPS優先</option><option value="resolution" title="幅と高さを優先し、圧縮品質・FPSを調整">解像度優先</option></select></label>
          <label id="advancedBrowserOptimizationControl" class="check-row" title="通常は解像度とFPSを固定して圧縮品質だけを調整します。オンにすると容量内へ収めるためFPSと画像サイズも候補として探索します。"><input id="advancedBrowserOptimization" type="checkbox" /> 発展的：Web版でもFPS・画像サイズを探索</label>
          <div id="optimizationPriorityHelp" class="note optimization-help" aria-live="polite"></div>
          <label id="exportLoopsControl" title="アニメーション内部の再生回数です。1で1回再生、0で無限ループになります。">再生回数（1＝1回、0＝無限） <input id="exportLoops" type="number" min="0" max="100" value="1"></label>
          <label class="check-row" title="プリセット、方向、時間、解像度などをファイル名へ自動的に含めます。"><input id="autoFileName" type="checkbox" checked /> 設定からファイル名を自動作成</label>
          <label id="exportNameLanguageControl" title="自動作成するファイル名を英数字または日本語で表記します。">自動ファイル名の表記 <select id="exportNameLanguage"><option value="en">英数字</option><option value="ja">日本語</option></select></label>
          <label title="保存されるファイルまたはZIPの名前です。使用できない記号は自動的に置き換えます。">ファイル名 <input id="exportName" value="fade_cover_1s_960x540"></label>
          <button id="exportButton" title="現在の設定でファイルを作成して保存します。">書き出す</button>
          <progress id="exportProgress" max="1" value="0"></progress>
          <div id="exportResult" class="file-info">未書き出し</div>
          <button id="inspectExport" disabled>書き出したファイルを検査</button>
        </div>
        <aside class="export-preview-column" id="exportPreviewColumn">
          <div id="ccfSetPreview" class="set-preview" hidden>
            <div class="set-preview-toolbar"><strong title="CCFOLIA向けのOUT・HOLD・INを並べて確認できます。">3素材一括プレビュー</strong><button id="setPreviewPlay" type="button" title="OUTとINを同時に先頭から再生します。HOLDは静止画です。">▶ 3つを再生</button></div>
            <label class="set-preview-direction" title="OUTとINで見た目の進行方向が揃うよう、一括して方向を変更します。">動作方向 <select id="setPreviewDirection"></select></label>
            <div class="set-preview-grid"><figure title="OUT：透明から指定色へ変化し、現在のシーンを覆います。"><canvas id="setPreviewOut"></canvas><figcaption title="透明 → 指定色。シーンを隠す素材です。">OUT</figcaption></figure><figure title="HOLD：画面を指定色で覆ったまま保持する静止PNGです。"><canvas id="setPreviewHold"></canvas><figcaption title="指定色で全面を覆う、シーン切り替え中の保持素材です。">HOLD</figcaption></figure><figure title="IN：指定色から透明へ変化し、次のシーンを表示します。"><canvas id="setPreviewIn"></canvas><figcaption title="指定色 → 透明。次のシーンを見せる素材です。">IN</figcaption></figure></div>
          </div>
          <div class="warning"><strong>再エンコードについて：</strong>色変更、解像度変更、フレーム加工、形式変換など、処理内容によっては再エンコード・再圧縮が行われます。元ファイルと比較して画質や容量が変化する場合があります。可能な処理では将来的に無劣化編集を優先しますが、無劣化を保証しません。</div>
        </aside>
      </div>
    </section>

    <section id="about" class="view">
      <div class="panel prose">
        <h2>使い方</h2>

        <ol>
          <li>「設定」でトランジションの種類、動作、色、時間、透明度を選びます。</li>
          <li>中央のプレビューとシークバーで動きと全面被覆のタイミングを確認します。</li>
          <li>右側の「書き出し」で形式、解像度、FPS、容量上限を選んで保存します。</li>
          <li>必要に応じて「検査」へファイルをドロップし、各フレームとSafe Cutを確認します。</li>
        </ol>

        <p>CCFOLIA向けのOUT・HOLD・INが必要な場合は、書き出し形式から「3素材セット」を選んでください。</p>

        <h2>制作物の利用条件</h2>

        <p>
          Transition Studioを使用して作成したWebP / APNG / WebM等の制作物は、
          自分の配信・動画・TRPGセッション・シナリオ・ゲーム・Webコンテンツ等へ、
          商用・非商用を問わず組み込んで利用できます。
        </p>

        <p>
          有料の商品・サービス・コンテンツ、収益化された配信や動画等で利用する場合は、
          商品ページ、README、概要欄、クレジット等の確認しやすい場所に
          Transition Studioへのリンクを記載してください。
        </p>

        <h3>シナリオ・ルームデータ等への同梱</h3>

        <p>
          TRPGシナリオやCCFOLIA等のルームデータ、ゲームその他のコンテンツに、
          演出や構成の一部として制作物を同梱・配布することもできます。
          有料で配布・販売する場合は、Transition Studioへのリンクを記載してください。
        </p>

        <h3>制作物の配布・販売</h3>

        <p>
          制作物を、トランジション素材そのものとして不特定多数へ公開・再配布・販売することはできません。
          ただし、シナリオ・ルームデータ・ゲーム等の演出や構成に従属する形で同梱することはできます。
          第三者素材を入力した場合は、元素材の利用規約と権利条件が優先されます。
        </p>

        <h3>限定的な私的共有</h3>

        <p>
          セッション参加者、友人、共同制作者など、
          実際の利用に必要な範囲で限定された相手へ非営利で制作物を共有することは問題ありません。
          不特定多数への素材としての公開・再配布は含みません。
        </p>

        <h3>Transition Studio本体について</h3>

        <p>
          制作物の利用許可は、Transition Studio本体のプログラム、ソースコード、UI、ドキュメント等の再利用を許可するものではありません。
          一般的なトランジション表現を独自のコード・独自の実装で制作することを制限するものではありません。
        </p>

        <p class="note">
          詳しい条件と最新情報は<a href="./LICENSE.md" target="_blank" rel="noopener noreferrer">LICENSE.md</a>を確認してください。本ツールは各外部サービスの非公式ツールです。
        </p>

        <h2>お問い合わせ・不具合報告</h2>

        <p>
          不具合や要望は<a href="https://github.com/aoko2477/transition-studio-web/issues" target="_blank" rel="noopener noreferrer">GitHub Issues</a>へお願いします。
        </p>
      </div>
    </section>
  </main>
`;

const tabs = [...document.querySelectorAll(".tab")];
const views = [...document.querySelectorAll(".view")];
tabs.forEach((tab) =>
  tab.addEventListener("click", () => {
    if (tab.dataset.view === "export") setIntegratedExportMode(false);
    tabs.forEach((x) => x.classList.toggle("active", x === tab));
    views.forEach((v) =>
      v.classList.toggle("active", v.id === tab.dataset.view),
    );
  }),
);

const layer = document.querySelector("#transitionLayer");
const kind = document.querySelector("#kind");
const color = document.querySelector("#color");
const duration = document.querySelector("#duration");
const durationValue = document.querySelector("#durationValue");
const durationControl = document.querySelector("#durationControl");
const easing = document.querySelector("#easing");
const easingLabel = document.querySelector("#easingLabel");
const easingGraph = document.querySelector("#easingGraph");
const easingPath = document.querySelector("#easingPath");
const easingHandleLines = document.querySelector("#easingHandleLines");
const easingPoint1 = document.querySelector("#easingPoint1");
const easingPoint2 = document.querySelector("#easingPoint2");
const easingCode = document.querySelector("#easingCode");
const customExitEasing = document.querySelector("#customExitEasing");
const exitEasingControl = document.querySelector("#exitEasingControl");
const exitEasing = document.querySelector("#exitEasing");
const exitEasingGraph = document.querySelector("#exitEasingGraph");
const exitEasingPath = document.querySelector("#exitEasingPath");
const exitEasingHandleLines = document.querySelector("#exitEasingHandleLines");
const exitEasingPoint1 = document.querySelector("#exitEasingPoint1");
const exitEasingPoint2 = document.querySelector("#exitEasingPoint2");
const exitEasingCode = document.querySelector("#exitEasingCode");
const derivedExitEasing = document.querySelector("#derivedExitEasing");
const direction = document.querySelector("#direction");
const wipeAngle = document.querySelector("#wipeAngle");
const wipeAngleControl = document.querySelector("#wipeAngleControl");
const wipeDirectionSwitch = document.querySelector("#wipeDirectionSwitch");
const opacityMode = document.querySelector("#opacityMode");
const opacityModeSwitch = document.querySelector("#opacityModeSwitch");
const opacityModeHint = document.querySelector("#opacityModeHint");
const obsFormatHint = document.querySelector("#obsFormatHint");
const adjustOpacity = document.querySelector("#adjustOpacity");
const adjustOpacityControl = document.querySelector("#adjustOpacityControl");
const opacityControls = document.querySelector("#opacityControls");
const startOpacity = document.querySelector("#startOpacity");
const endOpacity = document.querySelector("#endOpacity");
const startOpacityValue = document.querySelector("#startOpacityValue");
const endOpacityValue = document.querySelector("#endOpacityValue");
const forceOpaque = document.querySelector("#forceOpaque");
const forceOpaqueControl = document.querySelector("#forceOpaqueControl");
const obsControls = document.querySelector("#obsControls");
const holdDuration = document.querySelector("#holdDuration");
const enterDuration = document.querySelector("#enterDuration");
const exitDuration = document.querySelector("#exitDuration");
const matchExitDuration = document.querySelector("#matchExitDuration");
const advancedTimeline = document.querySelector("#advancedTimeline");
const timelineOpacityControls = document.querySelector(
  "#timelineOpacityControls",
);
const timelineStartOpacity = document.querySelector("#timelineStartOpacity");
const timelineCoverOpacity = document.querySelector("#timelineCoverOpacity");
const timelineEndOpacity = document.querySelector("#timelineEndOpacity");
const matchTimelineEndOpacity = document.querySelector(
  "#matchTimelineEndOpacity",
);
const enterSegment = document.querySelector("#enterSegment");
const holdSegment = document.querySelector("#holdSegment");
const exitSegment = document.querySelector("#exitSegment");
const enterSegmentValue = document.querySelector("#enterSegmentValue");
const holdSegmentValue = document.querySelector("#holdSegmentValue");
const exitSegmentValue = document.querySelector("#exitSegmentValue");
const timingTotal = document.querySelector("#timingTotal");
const exitStyle = document.querySelector("#exitStyle");
const exitStyleControl = document.querySelector("#exitStyleControl");
const continueExitOption = document.querySelector("#continueExitOption");
const countControl = document.querySelector("#countControl");
const stripeStaggerControl = document.querySelector("#stripeStaggerControl");
const stripeStaggerSlider = document.querySelector("#stripeStaggerSlider");
const stripeStagger = document.querySelector("#stripeStagger");
const stripeStaggerPatternControl = document.querySelector("#stripeStaggerPatternControl");
const stripeStaggerPattern = document.querySelector("#stripeStaggerPattern");
const tileDirectionControl = document.querySelector("#tileDirectionControl");
const tileDirection = document.querySelector("#tileDirection");
const directionControl = document.querySelector("#directionControl");
const colorControl = document.querySelector("#colorControl");
const irisDirectionControl = document.querySelector("#irisDirectionControl");
const irisDirection = document.querySelector("#irisDirection");
const irisTimingControl = document.querySelector("#irisTimingControl");
const irisTiming = document.querySelector("#irisTiming");
const multiIrisControl = document.querySelector("#multiIrisControl");
const multiIrisLayers = document.querySelector("#multiIrisLayers");
const multiIrisStagger = document.querySelector("#multiIrisStagger");
const multiIrisColor1 = document.querySelector("#multiIrisColor1");
const multiIrisColor2 = document.querySelector("#multiIrisColor2");
const multiIrisColor3 = document.querySelector("#multiIrisColor3");
const edgeFeatherControl = document.querySelector("#edgeFeatherControl");
const edgeFeatherSlider = document.querySelector("#edgeFeatherSlider");
const edgeFeather = document.querySelector("#edgeFeather");
const zoomDirectionControl = document.querySelector("#zoomDirectionControl");
const zoomDirection = document.querySelector("#zoomDirection");
const blinkPatternControl = document.querySelector("#blinkPatternControl");
const blinkPattern = document.querySelector("#blinkPattern");
const blinkBalanceControl = document.querySelector("#blinkBalanceControl");
const blinkBalance = document.querySelector("#blinkBalance");
const blinkFeatherControl = document.querySelector("#blinkFeatherControl");
const blinkFeatherSlider = document.querySelector("#blinkFeatherSlider");
const blinkFeather = document.querySelector("#blinkFeather");
const blinkTimingHint = document.querySelector("#blinkTimingHint");
const radialStartControl = document.querySelector("#radialStartControl");
const radialStart = document.querySelector("#radialStart");
const radialDirectionControl = document.querySelector("#radialDirectionControl");
const radialDirection = document.querySelector("#radialDirection");
const edgeControl = document.querySelector("#edgeControl");
const presetSummary = document.querySelector("#presetSummary");
const fogControls = document.querySelector("#fogControls");
const fogScale = document.querySelector("#fogScale");
const fogDensity = document.querySelector("#fogDensity");
const fogTurbulence = document.querySelector("#fogTurbulence");
const fogFeather = document.querySelector("#fogFeather");
const fogDrift = document.querySelector("#fogDrift");
const fogSeed = document.querySelector("#fogSeed");
const fogScaleValue = document.querySelector("#fogScaleValue");
const fogDensityValue = document.querySelector("#fogDensityValue");
const fogTurbulenceValue = document.querySelector("#fogTurbulenceValue");
const fogFeatherValue = document.querySelector("#fogFeatherValue");
const fogDriftValue = document.querySelector("#fogDriftValue");
const blinkEffectNote = document.querySelector("#blinkEffectNote");
const previewTitle = document.querySelector("#previewTitle");
const stage = document.querySelector("#stage");
const stageBackdrop = document.querySelector(".stage-backdrop");
const compoundCanvas = document.querySelector("#compoundCanvas");
const compoundContext = compoundCanvas.getContext("2d");
const previewBackground = document.querySelector("#previewBackground");
const previewBackgroundColor = document.querySelector(
  "#previewBackgroundColor",
);
const previewMatchFps = document.querySelector("#previewMatchFps");
const previewToggle = document.querySelector("#previewToggle");
const previewSeek = document.querySelector("#previewSeek");
const previewTime = document.querySelector("#previewTime");
const previewTimeline = document.querySelector("#previewTimeline");
const previewTimelineGraph = document.querySelector("#previewTimelineGraph");

function placePrimaryControls() {
  let anchor = presetSummary;
  const blinkControls = [
    blinkPatternControl,
    blinkBalanceControl,
    blinkFeatherControl,
    blinkEffectNote,
  ];
  if (effectiveKind() === "blink" && !selectedCompoundRecipe()) {
    for (const control of blinkControls) {
      anchor.after(control);
      anchor = control;
    }
  }
  for (const control of [
    document.querySelector("#opacityModeControl"),
    forceOpaqueControl,
    adjustOpacityControl,
    opacityControls,
    obsControls,
  ]) {
    anchor.after(control);
    anchor = control;
  }
  if (effectiveKind() === "wipe" && !selectedCompoundRecipe()) {
    anchor.after(wipeAngleControl);
    anchor = wipeAngleControl;
  }
  if (effectiveKind() === "iris" && !selectedCompoundRecipe()) {
    anchor.after(irisDirectionControl);
    anchor = irisDirectionControl;
  }
  if (["iris", "multi-iris"].includes(effectiveKind()) && !selectedCompoundRecipe()) {
    anchor.after(irisTimingControl);
    anchor = irisTimingControl;
    if (effectiveKind() === "multi-iris") {
      anchor.after(multiIrisControl);
      anchor = multiIrisControl;
    }
  }
  if (effectiveKind() === "zoom" && !selectedCompoundRecipe()) {
    anchor.after(zoomDirectionControl);
    anchor = zoomDirectionControl;
  }
  if (effectiveKind() === "radial" && !selectedCompoundRecipe()) {
    anchor.after(radialStartControl);
    anchor = radialStartControl;
    anchor.after(radialDirectionControl);
    anchor = radialDirectionControl;
  }
  if (effectiveKind() === "tile" && !selectedCompoundRecipe()) {
    anchor.after(tileDirectionControl);
    anchor = tileDirectionControl;
  }
  if (["split", "stripe"].includes(effectiveKind()) && !selectedCompoundRecipe()) {
    anchor.after(directionControl);
    anchor = directionControl;
  }
  if (effectiveKind() === "stripe" && !selectedCompoundRecipe()) {
    anchor.after(stripeStaggerControl);
    anchor = stripeStaggerControl;
    anchor.after(stripeStaggerPatternControl);
    anchor = stripeStaggerPatternControl;
  }
  if (["wipe", "split", "stripe"].includes(effectiveKind()) && !selectedCompoundRecipe()) {
    anchor.after(edgeFeatherControl);
    anchor = edgeFeatherControl;
  }
  anchor.after(colorControl);
}

const blinkFeatherPercent = () =>
  Math.max(0, Math.min(10, Number(blinkFeather.value) || 0));
const updateBlinkPreviewFeather = () => {
  layer.style.setProperty(
    "--blink-feather",
    `${(stage.clientHeight * blinkFeatherPercent()) / 100}px`,
  );
};
new ResizeObserver(updateBlinkPreviewFeather).observe(stage);
const timelineEnterArea = document.querySelector("#timelineEnterArea");
const timelineHoldArea = document.querySelector("#timelineHoldArea");
const timelineExitArea = document.querySelector("#timelineExitArea");
const timelineCurve = document.querySelector("#timelineCurve");
const timelineTransitionPoint = document.querySelector("#timelineTransitionPoint");
const timelineTransitionPointLabel = document.querySelector("#timelineTransitionPointLabel");
const timelinePlayhead = document.querySelector("#timelinePlayhead");
const timelineStartPoint = document.querySelector("#timelineStartPoint");
const timelineCoverPoint = document.querySelector("#timelineCoverPoint");
const timelineEndPoint = document.querySelector("#timelineEndPoint");
const timelineEnterLabel = document.querySelector("#timelineEnterLabel");
const timelineHoldLabel = document.querySelector("#timelineHoldLabel");
const timelineExitLabel = document.querySelector("#timelineExitLabel");
const coverageStatus = document.querySelector("#coverageStatus");
const dynamicAnimations = document.head.appendChild(
  document.createElement("style"),
);
let previewAnimations = [];
let replayRevision = 0;
let previewDuration = 0;
let previewPaused = false;
let previewFrameRequest = 0;
let activeOpacityAnimation = null;
let opacityFrames = [];

const presetDetails = {
  fade: ["フェード", "画面全体の濃さだけを変える基本効果"],
  wipe: ["ワイプ", "一方向から画面を覆う"],
  split: ["スプリット", "中央から上下に分かれて展開"],
  blink: ["まばたき", "横長の視界が縦につぶれて閉じる"],
  iris: ["アイリス", "円形に開閉する"],
  "multi-iris": ["多層アイリス", "時間差で重なる色面が中心から広がる"],
  stripe: ["ストライプ", "帯を順番に走らせる"],
  tile: ["タイル", "格子を順番に埋める"],
  radial: ["ラジアル", "時計回りに画面を覆う"],
  zoom: ["ズーム", "中央または外周を起点に拡大・収縮して覆う"],
  "compound-fogFill": ["霧・フィル［実験］", "揺らぐ霧が画面全体へ広がり、最後は単色へ収束"],
  "compound-fogSweep": ["霧・スイープ［実験］", "流れる霧が一方向から侵入して画面を覆う"],
  "compound-fogBloom": ["霧・ブルーム［実験］", "複数地点から霧が湧き、重なりながら全面を覆う"],
  "compound-softFocusFade": [
    "ソフトフォーカス・フェード",
    "幕の濃度と柔らかな白い霞を重ねる",
  ],
  "compound-inkBloom": [
    "墨のにじみ",
    "複数地点から不規則な墨が広がり全面を覆う",
  ],
  "compound-slashCut": ["斬撃", "斬線と閃光の後に暗幕が走る"],
  "compound-crossZoom": [
    "クロスズーム",
    "フェード・カメラズーム・フラッシュを合成",
  ],
  "compound-tileStagger": [
    "タイル・スタッガー",
    "時間差タイルとスケール整定を合成",
  ],
  "compound-blinkComposite": [
    "まばたき・カメラ",
    "まぶた・軽いズーム・整定を合成",
  ],
};

function selectedCompoundRecipe() {
  return kind.value.startsWith("compound-")
    ? COMPOUND_RECIPES[kind.value.slice("compound-".length)]
    : null;
}

function effectiveKind() {
  const recipe = selectedCompoundRecipe();
  return (
    recipe?.layers.find((item) => item.family === "baseMask")?.primitive ||
    kind.value
  );
}

const easingPresets = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};
let easingPoints = [...easingPresets[easing.value]];
let exitEasingPoints = [...easingPresets[exitEasing.value]];
let exitEasingInitialized = false;

function curveCssValue(points) {
  const values = points.map((value) => Number(value.toFixed(3)));
  return `cubic-bezier(${values.join(", ")})`;
}

function reversedCurve(points) {
  const [x1, y1, x2, y2] = points;
  return [1 - x2, 1 - y2, 1 - x1, 1 - y1];
}

function renderCurveGraph(graphParts, points) {
  const [graph, path, handleLines, pointOne, pointTwo, code] = graphParts;
  const [x1, y1, x2, y2] = points;
  const x = (value) => 14 + value * 212;
  const y = (value) => 106 - value * 92;
  const start = [14, 106];
  const end = [226, 14];
  const point1 = [x(x1), y(y1)];
  const point2 = [x(x2), y(y2)];
  path.setAttribute(
    "d",
    `M${start.join(" ")} C${point1.join(" ")},${point2.join(" ")},${end.join(" ")}`,
  );
  handleLines.setAttribute(
    "d",
    `M${start.join(" ")} L${point1.join(" ")} M${end.join(" ")} L${point2.join(" ")}`,
  );
  pointOne.setAttribute("cx", point1[0]);
  pointOne.setAttribute("cy", point1[1]);
  pointTwo.setAttribute("cx", point2[0]);
  pointTwo.setAttribute("cy", point2[1]);
  code.textContent = curveCssValue(points);
  return graph;
}

function renderEasingGraph() {
  renderCurveGraph(
    [
      easingGraph,
      easingPath,
      easingHandleLines,
      easingPoint1,
      easingPoint2,
      easingCode,
    ],
    easingPoints,
  );
}

function renderExitEasingGraph() {
  renderCurveGraph(
    [
      exitEasingGraph,
      exitEasingPath,
      exitEasingHandleLines,
      exitEasingPoint1,
      exitEasingPoint2,
      exitEasingCode,
    ],
    exitEasingPoints,
  );
}

function enableCurveDrag(graph, point, index, points, select, render) {
  point.addEventListener("pointerdown", (event) => {
    point.setPointerCapture(event.pointerId);
  });
  point.addEventListener("pointermove", (event) => {
    if (!point.hasPointerCapture(event.pointerId)) return;
    const bounds = graph.getBoundingClientRect();
    const graphX = ((event.clientX - bounds.left) * 240) / bounds.width;
    const graphY = ((event.clientY - bounds.top) * 120) / bounds.height;
    points[index] = Math.max(0, Math.min(1, (graphX - 14) / 212));
    points[index + 1] = Math.max(0, Math.min(1, (106 - graphY) / 92));
    select.value = "custom";
    render();
  });
  point.addEventListener("pointerup", replay);
}

function stripeOrderAt(index, count, pattern = "linear") {
  if (count <= 1) return 0;
  const normalized = index / (count - 1);
  if (pattern === "ease") return normalized * normalized * (3 - 2 * normalized);
  const orderedIndexes = pattern === "alternating"
    ? [
        ...Array.from({ length: Math.ceil(count / 2) }, (_, item) => item * 2),
        ...Array.from({ length: Math.floor(count / 2) }, (_, item) => item * 2 + 1),
      ]
    : pattern === "random"
      ? Array.from({ length: count }, (_, item) => item).sort(
          (left, right) => seededUnit(7349 + count, left) - seededUnit(7349 + count, right),
        )
      : null;
  return orderedIndexes ? orderedIndexes.indexOf(index) / (count - 1) : normalized;
}

function buildEffectParts(totalDuration = 1000) {
  layer.replaceChildren();
  const baseKind = effectiveKind();
  if (baseKind === "stripe") {
    const count = Math.max(
      1,
      Math.min(64, Number(document.querySelector("#count").value) || 8),
    );
    const staggerRatio = Math.max(0, Math.min(0.5, Number(stripeStagger.value) / 100));
    const totalStaggerMs = totalDuration * staggerRatio;
    const partDuration = Math.max(1, totalDuration - totalStaggerMs);
    for (let index = 0; index < count; index += 1) {
      const bar = document.createElement("i");
      bar.style.setProperty("--index", index);
      bar.style.setProperty("--parts", count);
      bar.style.setProperty(
        "--part-delay",
        `${stripeOrderAt(index, count, stripeStaggerPattern.value) * totalStaggerMs}ms`,
      );
      bar.style.setProperty("--part-duration", `${partDuration}ms`);
      layer.append(bar);
    }
  }
  if (baseKind === "tile") {
    const count = Math.max(
      2,
      Math.min(10, Number(document.querySelector("#count").value) || 6),
    );
    const parts = count * count;
    const delayStep =
      opacityMode.value === "roundtrip" || parts === 1
        ? 0
        : Math.min(5, (totalDuration * 0.35) / (parts - 1));
    const partDuration = Math.max(1, totalDuration - delayStep * (parts - 1));
    layer.style.setProperty("--tile-count", count);
    for (let index = 0; index < parts; index += 1) {
      const tile = document.createElement("i");
      tile.style.setProperty("--index", index);
      tile.style.setProperty("--part-delay", `${index * delayStep}ms`);
      tile.style.setProperty("--part-duration", `${partDuration}ms`);
      layer.append(tile);
    }
  }
}

function formatPreviewTime(milliseconds) {
  return (Math.max(0, milliseconds) / 1000).toFixed(2);
}

function renderPreviewTime(milliseconds) {
  const bounded = Math.max(0, Math.min(previewDuration, milliseconds || 0));
  const fps = Math.max(5, Math.min(60, Number(document.querySelector("#exportFps")?.value) || 30));
  const frameDuration = 1000 / fps;
  const current = previewMatchFps.checked && bounded < previewDuration
    ? Math.floor(bounded / frameDuration) * frameDuration
    : bounded;
  previewSeek.value = current;
  previewTime.textContent = `${formatPreviewTime(current)} / ${formatPreviewTime(previewDuration)}秒`;
  const playheadX = previewDuration ? (current / previewDuration) * 1000 : 0;
  timelinePlayhead.setAttribute("x1", playheadX);
  timelinePlayhead.setAttribute("x2", playheadX);
  renderCompoundFrame(current);
}

function transitionCoverageAt(timeMs) {
  if (!previewDuration) return 0;
  if (opacityMode.value !== "roundtrip") {
    const progress = Math.max(0, Math.min(1, timeMs / previewDuration));
    return opacityMode.value === "reveal" ||
      (opacityMode.value === "custom" &&
        Number(startOpacity.value) > Number(endOpacity.value))
      ? 1 - progress
      : progress;
  }
  const enterMs = Math.max(100, Number(enterDuration.value) * 1000 || 1000);
  const holdMs = Math.max(0, Number(holdDuration.value) * 1000 || 0);
  const exitMs = Math.max(100, Number(exitDuration.value) * 1000 || 1000);
  if (timeMs < enterMs) return timeMs / enterMs;
  if (timeMs <= enterMs + holdMs) return 1;
  return Math.max(0, 1 - (timeMs - enterMs - holdMs) / exitMs);
}

function transitionOpacityAt(timeMs) {
  if (!previewDuration) return 0;
  if (opacityMode.value !== "roundtrip") {
    const progress = Math.max(0, Math.min(1, timeMs / previewDuration));
    const start = Number(startOpacity.value) / 100;
    const end = Number(endOpacity.value) / 100;
    return start + (end - start) * progress;
  }
  const coverage = transitionCoverageAt(timeMs);
  const start = advancedTimeline.checked
    ? Number(timelineStartOpacity.value) / 100
    : 0;
  const covered = advancedTimeline.checked
    ? Number(timelineCoverOpacity.value) / 100
    : 1;
  const end = advancedTimeline.checked
    ? Number(timelineEndOpacity.value) / 100
    : 0;
  const enterMs = Math.max(100, Number(enterDuration.value) * 1000 || 1000);
  const holdMs = Math.max(0, Number(holdDuration.value) * 1000 || 0);
  if (timeMs <= enterMs + holdMs) return start + (covered - start) * coverage;
  return end + (covered - end) * coverage;
}

function resizeCompoundCanvas() {
  const bounds = stage.getBoundingClientRect();
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  if (compoundCanvas.width !== width || compoundCanvas.height !== height) {
    compoundCanvas.width = width;
    compoundCanvas.height = height;
  }
  compoundContext.setTransform(scale, 0, 0, scale, 0, 0);
  return { width: bounds.width, height: bounds.height };
}

function drawBlinkComposite(width, height, closure) {
  const samples = 96;
  const shapeMix = Math.sin(Math.PI * closure);
  const geometry = (x) => {
    const shape = Math.max(0, Math.sin(Math.PI * x)) ** 1.7;
    const factor = 1 - shapeMix * 0.72 * (1 - shape);
    const center = 0.5 + (0.56 - 0.5) * closure;
    const halfGap = 0.5 * (1 - closure) * factor;
    const curve = 0.094 * shapeMix * shape;
    return {
      top: center - halfGap - curve,
      bottom: center + halfGap + curve * 0.9,
    };
  };
  compoundContext.fillStyle = color.value;
  compoundContext.beginPath();
  compoundContext.moveTo(0, 0);
  compoundContext.lineTo(width, 0);
  for (let index = 0; index <= samples; index += 1) {
    const x = index / samples;
    compoundContext.lineTo(x * width, geometry(x).top * height);
  }
  compoundContext.closePath();
  compoundContext.fill();
  compoundContext.beginPath();
  compoundContext.moveTo(0, height);
  compoundContext.lineTo(width, height);
  for (let index = samples; index >= 0; index -= 1) {
    const x = index / samples;
    compoundContext.lineTo(x * width, geometry(x).bottom * height);
  }
  compoundContext.closePath();
  compoundContext.fill();
}

function renderCompoundFrame(timeMs) {
  const recipe = selectedCompoundRecipe();
  const canvasGeometry =
    (["wipe", "split", "stripe", "tile", "iris", "multi-iris", "radial", "zoom", "blink"].includes(
      effectiveKind(),
    ) || (previewMatchFps.checked && effectiveKind() === "fade")) && !recipe;
  compoundCanvas.classList.toggle(
    "is-active",
    Boolean(recipe) || canvasGeometry,
  );
  if (canvasGeometry) {
    stageBackdrop.style.transform = "";
    stageBackdrop.style.filter = "";
    const { width, height } = resizeCompoundCanvas();
    renderTransitionFrame(
      compoundContext,
      width,
      height,
      timeMs,
      exportState(),
    );
    return;
  }
  if (!recipe) {
    stageBackdrop.style.transform = "";
    stageBackdrop.style.filter = "";
    return;
  }
  const { width, height } = resizeCompoundCanvas();
  compoundContext.clearRect(0, 0, width, height);
  const normalizedTime = previewDuration
    ? (timeMs / previewDuration) * recipe.durationMs
    : 0;
  const state = evaluateRecipe(recipe, normalizedTime);
  const coverage = transitionCoverageAt(timeMs);
  const visualOpacity = transitionOpacityAt(timeMs);
  const transformLayer = state.layers.find(
    (item) => item.family === "transform",
  );
  const finishLayer = state.layers.find((item) => item.family === "finish");
  const zoomProgress = finishLayer?.active
    ? 1 - finishLayer.progress
    : transformLayer?.progress || 0;
  const zoomAmount = recipe.id === "cross-zoom" ? 0.14 : 0.04;
  stageBackdrop.style.transform = `scale(${1 + zoomAmount * zoomProgress})`;
  stageBackdrop.style.filter =
    recipe.id === "cross-zoom"
      ? `blur(${Math.sin(Math.PI * state.progress) * 3}px)`
      : recipe.id === "soft-focus-fade"
        ? `blur(${Math.sin(Math.PI * state.progress) * 8}px)`
        : "";

  if (["soft-focus-fade", "ink-bloom", "slash-cut", "fog-fill", "fog-sweep", "fog-bloom"].includes(recipe.id)) {
    stageBackdrop.style.transform = "";
    stageBackdrop.style.filter = "";
    const renderState = exportState();
    renderTransitionFrame(compoundContext, width, height, timeMs, renderState);
    compoundContext.globalAlpha = 1;
    return;
  }

  if (recipe.id === "cross-zoom") {
    compoundContext.globalAlpha = visualOpacity;
    compoundContext.fillStyle = color.value;
    compoundContext.fillRect(0, 0, width, height);
    const flash = state.layers.find((item) => item.primitive === "flash");
    if (flash?.active) {
      compoundContext.globalAlpha =
        Math.sin(Math.PI * flash.progress) * flash.strength;
      compoundContext.fillStyle = "#ffffff";
      compoundContext.fillRect(0, 0, width, height);
    }
  } else if (recipe.id === "tile-stagger") {
    const columns = 8;
    const rows = 5;
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    compoundContext.fillStyle = color.value;
    compoundContext.globalAlpha = forceOpaque.checked ? 1 : visualOpacity;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const delay = seededUnit(recipe.seed, index) * 0.32;
        const local = Math.max(
          0,
          Math.min(1, (coverage - delay) / (1 - delay)),
        );
        const scale = local * local * (3 - 2 * local);
        const x = (column + 0.5) * cellWidth;
        const y = (row + 0.5) * cellHeight;
        compoundContext.save();
        compoundContext.translate(x, y);
        compoundContext.scale(scale, scale);
        compoundContext.fillRect(
          -cellWidth / 2 - 0.5,
          -cellHeight / 2 - 0.5,
          cellWidth + 1,
          cellHeight + 1,
        );
        compoundContext.restore();
      }
    }
  } else if (recipe.id === "blink-composite") {
    compoundContext.globalAlpha = forceOpaque.checked ? 1 : visualOpacity;
    drawBlinkComposite(width, height, coverage);
  }
  compoundContext.globalAlpha = 1;
}

function setPreviewPosition(target) {
  previewAnimations.forEach((animation) => {
    animation.pause();
    animation.currentTime = target;
  });
  previewPaused = true;
  previewToggle.textContent =
    target >= previewDuration ? "最初から再生" : "再生";
  renderPreviewTime(target);
}

function renderPreviewTimeline(total, enter, hold, isRoundtrip) {
  const enterEnd = isRoundtrip ? (enter / total) * 1000 : 1000;
  const exitStart = isRoundtrip ? ((enter + hold) / total) * 1000 : 1000;
  const startAlpha = isRoundtrip
    ? advancedTimeline.checked
      ? Number(timelineStartOpacity.value)
      : 0
    : Number(startOpacity.value);
  const coverAlpha = isRoundtrip
    ? advancedTimeline.checked
      ? Number(timelineCoverOpacity.value)
      : 100
    : Number(endOpacity.value);
  const endAlpha = isRoundtrip
    ? advancedTimeline.checked
      ? Number(timelineEndOpacity.value)
      : 0
    : coverAlpha;
  const hasTransitionPoint = isRoundtrip && hold > 0 && coverAlpha >= 99.9;
  const transitionPoint = hasTransitionPoint
    ? stingerTransitionPointMs(enter, hold)
    : null;
  const transitionPointX = transitionPoint === null
    ? 0
    : (transitionPoint / total) * 1000;
  timelineTransitionPoint.classList.toggle("is-hidden", !hasTransitionPoint);
  timelineTransitionPointLabel.classList.toggle("is-hidden", !hasTransitionPoint);
  timelineTransitionPoint.setAttribute("x1", transitionPointX);
  timelineTransitionPoint.setAttribute("x2", transitionPointX);
  timelineTransitionPointLabel.setAttribute(
    "x",
    Math.min(930, Math.max(8, transitionPointX + 8)),
  );
  timelineTransitionPointLabel.textContent = transitionPoint === null
    ? "TP"
    : `TP ${transitionPoint}ms`;
  const y = (alpha) => 76 - (Math.max(0, Math.min(100, alpha)) / 100) * 52;
  const curveSegment = (x0, y0, x1, y1, points) => {
    const [x1Control, y1Control, x2Control, y2Control] = points;
    const dx = x1 - x0;
    const dy = y1 - y0;
    return `C ${x0 + dx * x1Control} ${y0 + dy * y1Control}, ${x0 + dx * x2Control} ${y0 + dy * y2Control}, ${x1} ${y1}`;
  };
  const enterPath = curveSegment(
    0,
    y(startAlpha),
    enterEnd,
    y(coverAlpha),
    easingPoints,
  );
  let path = `M 0 ${y(startAlpha)} ${enterPath}`;
  if (isRoundtrip) {
    const exitPoints = customExitEasing.checked
      ? exitEasingPoints
      : reversedCurve(easingPoints);
    path += ` L ${exitStart} ${y(coverAlpha)} ${curveSegment(exitStart, y(coverAlpha), 1000, y(endAlpha), exitPoints)}`;
  }
  timelineCurve.setAttribute("d", path);
  timelineEnterArea.setAttribute("x", 0);
  timelineEnterArea.setAttribute("width", enterEnd);
  timelineHoldArea.setAttribute("x", enterEnd);
  timelineHoldArea.setAttribute("width", Math.max(0, exitStart - enterEnd));
  timelineExitArea.setAttribute("x", exitStart);
  timelineExitArea.setAttribute("width", Math.max(0, 1000 - exitStart));
  timelineEnterLabel.textContent = isRoundtrip ? "入り" : "変化";
  timelineEnterLabel.setAttribute("x", Math.max(14, enterEnd / 2 - 18));
  timelineHoldLabel.classList.toggle("is-hidden", !isRoundtrip);
  timelineExitLabel.classList.toggle("is-hidden", !isRoundtrip);
  timelineHoldLabel.setAttribute("x", (enterEnd + exitStart) / 2 - 18);
  timelineExitLabel.setAttribute("x", (exitStart + 1000) / 2 - 18);
  [
    [timelineStartPoint, 0, startAlpha],
    [timelineCoverPoint, enterEnd, coverAlpha],
    [timelineEndPoint, 1000, endAlpha],
  ].forEach(([point, pointX, alpha]) => {
    point.setAttribute("cx", pointX);
    point.setAttribute("cy", y(alpha));
  });
  previewTimeline.dataset.editable = String(
    isRoundtrip && advancedTimeline.checked,
  );
}

function enableTimelineOpacityDrag(point, input) {
  point.addEventListener("pointerdown", (event) => {
    if (!advancedTimeline.checked) return;
    event.stopPropagation();
    point.setPointerCapture(event.pointerId);
  });
  point.addEventListener("pointermove", (event) => {
    if (!point.hasPointerCapture(event.pointerId)) return;
    const bounds = previewTimelineGraph.getBoundingClientRect();
    const graphY = ((event.clientY - bounds.top) * 86) / bounds.height;
    input.value = Math.round(
      Math.max(0, Math.min(100, ((76 - graphY) / 52) * 100)),
    );
    if (input === timelineStartOpacity && matchTimelineEndOpacity.checked)
      timelineEndOpacity.value = input.value;
    replay();
  });
}

function trackPreviewTime() {
  cancelAnimationFrame(previewFrameRequest);
  const tick = () => {
    const current =
      previewAnimations[0] && Number(previewAnimations[0].currentTime);
    renderPreviewTime(Number.isFinite(current) ? current : 0);
    if (!previewPaused && current < previewDuration)
      previewFrameRequest = requestAnimationFrame(tick);
    if (current >= previewDuration) previewToggle.textContent = "最初から再生";
  };
  previewFrameRequest = requestAnimationFrame(tick);
}

function collectPreviewAnimations(expectedRevision) {
  if (expectedRevision !== replayRevision) return;
  previewAnimations = layer.getAnimations({ subtree: true });
  previewPaused = false;
  previewToggle.textContent = "一時停止";
  previewSeek.max = previewDuration;
  renderPreviewTime(0);
  trackPreviewTime();
}

function updatePreviewBackground() {
  stage.dataset.background = previewBackground.value;
  previewBackgroundColor.classList.toggle(
    "is-hidden",
    previewBackground.value !== "custom",
  );
  stage.style.setProperty("--preview-background", previewBackgroundColor.value);
}

function updateFogControls() {
  const recipe = selectedCompoundRecipe();
  const isFog = Boolean(recipe?.id?.startsWith("fog-"));
  fogControls.classList.toggle("is-hidden", !isFog);
  if (!isFog) return;
  fogScaleValue.textContent = Number(fogScale.value).toFixed(1);
  fogDensityValue.textContent = fogDensity.value;
  fogTurbulenceValue.textContent = fogTurbulence.value;
  fogFeatherValue.textContent = fogFeather.value;
  fogDriftValue.textContent = Number(fogDrift.value).toFixed(2);
  document.querySelector("#directionLabel").textContent = "霧の流れる方向";
  directionControl.classList.remove("is-hidden");
}

function applyFogRecipeDefaults(recipe) {
  if (!recipe?.id?.startsWith("fog-")) return;
  const defaults = recipe.defaults || {};
  fogScale.value = defaults.scale ?? 3.4;
  fogDensity.value = defaults.density ?? 55;
  fogTurbulence.value = defaults.turbulence ?? 58;
  fogFeather.value = defaults.feather ?? 18;
  fogDrift.value = defaults.drift ?? 0.48;
  fogSeed.value = recipe.seed ?? 8127;
  updateFogControls();
}

function updateOpacityControls() {
  const presets = {
    roundtrip: [0, 0],
    cover: [0, 100],
    reveal: [100, 0],
  };
  const baseKind = effectiveKind();
  if (direction.dataset.forKind !== baseKind) {
    const definitions = baseKind === "split"
      ? [["vertical-center", "中央から上下へ"], ["vertical-edges", "上下から中央へ"], ["horizontal-center", "中央から左右へ"], ["horizontal-edges", "左右から中央へ"]]
      : [["right", "左から右へ"], ["left", "右から左へ"], ["down", "上から下へ"], ["up", "下から上へ"]];
    const previous = direction.value;
    direction.replaceChildren(...definitions.map(([value, label]) => new Option(label, value)));
    direction.value = definitions.some(([value]) => value === previous) ? previous : definitions[0][0];
    direction.dataset.forKind = baseKind;
    document.querySelector("#directionLabel").textContent = baseKind === "split" ? "スプリット方向" : "ストライプ方向";
  }
  const isGeometry = baseKind !== "fade";
  const fixedOpaqueGeometry = ["split", "stripe"].includes(baseKind);
  if (opacityMode.value === "custom") {
    opacityMode.value =
      Number(startOpacity.value) > Number(endOpacity.value) ? "reveal" : "cover";
    adjustOpacity.checked = true;
  }
  if (fixedOpaqueGeometry) {
    forceOpaque.checked = true;
    adjustOpacity.checked = false;
  }
  forceOpaque.disabled = fixedOpaqueGeometry;
  opacityModeSwitch.querySelectorAll("button").forEach((button) => {
    const active = button.dataset.opacityMode === opacityMode.value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const normalizedWipeAngle =
    (((Number(wipeAngle.value) || 0) % 360) + 360) % 360;
  wipeDirectionSwitch.querySelectorAll("button").forEach((button) => {
    const active = Number(button.dataset.angle) === normalizedWipeAngle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  opacityModeHint.textContent =
    opacityMode.value === "cover"
      ? "OUTを確認中。3素材セットでは反転したINも同時に書き出します。"
      : opacityMode.value === "reveal"
        ? "INを確認中。3素材セットでは反転したOUTも同時に書き出します。"
        : document.documentElement.dataset.edition === "local" &&
            document.querySelector("#webmOption")?.disabled === false
          ? "OBS向け：入り・全面被覆保持・抜けを1本で確認します。ローカル版ではWebMに書き出せます。"
          : "OBS向け：入り・全面被覆保持・抜けを1本で確認します。WebMはローカル版に実装予定です。";
  const customOpacityEnabled =
    !fixedOpaqueGeometry &&
    opacityMode.value !== "roundtrip" &&
    adjustOpacity.checked &&
    (!isGeometry || !forceOpaque.checked);
  adjustOpacityControl.classList.toggle(
    "is-hidden",
    fixedOpaqueGeometry || opacityMode.value === "roundtrip",
  );
  adjustOpacity.disabled = fixedOpaqueGeometry || opacityMode.value === "roundtrip";
  opacityControls.classList.toggle("enabled", customOpacityEnabled);
  opacityControls.classList.toggle("is-hidden", !customOpacityEnabled);
  startOpacity.disabled = !customOpacityEnabled;
  endOpacity.disabled = !customOpacityEnabled;
  if (!adjustOpacity.checked) {
    [startOpacity.value, endOpacity.value] = presets[opacityMode.value];
  }
  startOpacityValue.textContent = `${startOpacity.value}%`;
  endOpacityValue.textContent = `${endOpacity.value}%`;
  forceOpaqueControl.classList.toggle(
    "is-hidden",
    !isGeometry || fixedOpaqueGeometry,
  );
  obsControls.classList.toggle("is-hidden", opacityMode.value !== "roundtrip");
  timelineOpacityControls.classList.toggle(
    "is-hidden",
    opacityMode.value !== "roundtrip" || !advancedTimeline.checked,
  );
  durationControl.classList.toggle(
    "is-hidden",
    opacityMode.value === "roundtrip",
  );
  easingLabel.textContent =
    opacityMode.value === "roundtrip" ? "入り側の動き方" : "動き方";
  exitEasingControl.classList.toggle("is-hidden", !customExitEasing.checked);
  const automaticExitPoints = reversedCurve(easingPoints);
  derivedExitEasing.textContent = customExitEasing.checked
    ? ""
    : `抜け側は入り曲線を自動反転：${curveCssValue(automaticExitPoints)}`;
  const supportsContinue =
    ["wipe", "split", "stripe", "iris", "multi-iris", "radial"].includes(baseKind) &&
    !selectedCompoundRecipe();
  continueExitOption.disabled = !supportsContinue;
  if (!supportsContinue && exitStyle.value === "continue")
    exitStyle.value = "reverse";
  exitStyleControl.classList.toggle(
    "is-hidden",
    baseKind === "fade" || Boolean(selectedCompoundRecipe()),
  );
  countControl.classList.toggle(
    "is-hidden",
    !["stripe", "tile"].includes(baseKind) || Boolean(selectedCompoundRecipe()),
  );
  stripeStaggerControl.classList.toggle(
    "is-hidden",
    baseKind !== "stripe" || Boolean(selectedCompoundRecipe()),
  );
  stripeStaggerPatternControl.classList.toggle(
    "is-hidden",
    baseKind !== "stripe" || Boolean(selectedCompoundRecipe()),
  );
  tileDirectionControl.classList.toggle(
    "is-hidden",
    baseKind !== "tile" || Boolean(selectedCompoundRecipe()),
  );
  directionControl.classList.toggle("is-hidden", !["split", "stripe"].includes(baseKind));
  wipeAngleControl.classList.toggle("is-hidden", baseKind !== "wipe");
  irisDirectionControl.classList.toggle("is-hidden", baseKind !== "iris");
  irisTimingControl.classList.toggle("is-hidden", !["iris", "multi-iris"].includes(baseKind));
  multiIrisControl.classList.toggle("is-hidden", baseKind !== "multi-iris");
  edgeFeatherControl.classList.toggle("is-hidden", !["wipe", "split", "stripe"].includes(baseKind));
  zoomDirectionControl.classList.toggle("is-hidden", baseKind !== "zoom");
  blinkPatternControl.classList.toggle(
    "is-hidden",
    baseKind !== "blink" || Boolean(selectedCompoundRecipe()),
  );
  blinkBalanceControl.classList.toggle(
    "is-hidden",
    baseKind !== "blink" || Boolean(selectedCompoundRecipe()),
  );
  blinkFeatherControl.classList.toggle(
    "is-hidden",
    baseKind !== "blink" || Boolean(selectedCompoundRecipe()),
  );
  radialStartControl.classList.toggle("is-hidden", baseKind !== "radial");
  radialDirectionControl.classList.toggle("is-hidden", baseKind !== "radial");
  blinkEffectNote.classList.toggle(
    "is-hidden",
    baseKind !== "blink" || Boolean(selectedCompoundRecipe()),
  );
  edgeControl.classList.add("is-hidden");
  updateFogControls();
  placePrimaryControls();
}

function applyBlinkRecommendedTiming() {
  const blinkThenClose = blinkPattern.value === "double";
  const enterSeconds = blinkThenClose ? 0.6 : 1.5;
  const exitSeconds = blinkThenClose ? 0.8 : 1.8;
  duration.value = opacityMode.value === "reveal" ? exitSeconds : enterSeconds;
  enterDuration.value = enterSeconds;
  holdDuration.value = 0.1;
  matchExitDuration.checked = false;
  exitDuration.disabled = false;
  exitDuration.value = exitSeconds;
  blinkTimingHint.textContent = blinkThenClose
    ? "推奨：ぱちっ＋本閉じ0.6秒・保持0.1秒・抜け0.8秒"
    : "推奨：ゆっくり閉じ1.5秒・保持0.1秒・開き1.8秒";
}

function updateRoundtripTiming() {
  const normalDuration = Math.max(100, Number(duration.value) * 1000 || 1000);
  if (opacityMode.value !== "roundtrip") {
    coverageStatus.textContent = "開始から終了までの透明度変化";
    coverageStatus.classList.remove("unsafe");
    opacityFrames = [
      {
        opacity: Number(startOpacity.value) / 100,
        offset: 0,
        easing: curveCssValue(easingPoints),
      },
      { opacity: Number(endOpacity.value) / 100, offset: 1 },
    ];
    renderPreviewTimeline(normalDuration, normalDuration, 0, false);
    return normalDuration;
  }
  const enter = Math.max(100, Number(enterDuration.value) * 1000 || 1000);
  const hold = Math.max(0, Number(holdDuration.value) * 1000 || 0);
  if (matchExitDuration.checked) exitDuration.value = enterDuration.value;
  exitDuration.disabled = matchExitDuration.checked;
  if (matchTimelineEndOpacity.checked)
    timelineEndOpacity.value = timelineStartOpacity.value;
  timelineEndOpacity.disabled = matchTimelineEndOpacity.checked;
  const exitDurationMs = Math.max(
    100,
    Number(exitDuration.value) * 1000 || 1000,
  );
  const enterCurve = curveCssValue(easingPoints);
  const exitCurve = customExitEasing.checked
    ? curveCssValue(exitEasingPoints)
    : curveCssValue(reversedCurve(easingPoints));
  const startAlpha = advancedTimeline.checked
    ? Math.max(0, Math.min(100, Number(timelineStartOpacity.value))) / 100
    : 0;
  const coverAlpha = advancedTimeline.checked
    ? Math.max(0, Math.min(100, Number(timelineCoverOpacity.value))) / 100
    : 1;
  const endAlpha = advancedTimeline.checked
    ? Math.max(0, Math.min(100, Number(timelineEndOpacity.value))) / 100
    : 0;
  const transitionPoint = coverAlpha >= 0.999 && hold > 0
    ? stingerTransitionPointMs(enter, hold)
    : null;
  coverageStatus.textContent =
    coverAlpha >= 0.999
      ? transitionPoint === null
        ? "全面被覆／保持時間を設けるとTPを表示"
        : `全面被覆／TP ${transitionPoint}ms`
      : `黒幕 ${Math.round(coverAlpha * 100)}%／OBS切替には非推奨`;
  coverageStatus.classList.toggle("unsafe", coverAlpha < 0.999);
  const total = enter + hold + exitDurationMs;
  const edge = (enter / total) * 100;
  const exit = ((enter + hold) / total) * 100;
  const blinkAt = (ratio) => edge * ratio;
  const blinkOutAt = (ratio) => exit + (100 - exit) * ratio;
  const fadeOpaqueGeometry =
    effectiveKind() !== "fade" &&
    forceOpaque.checked &&
    exitStyle.value === "fade";
  opacityFrames = fadeOpaqueGeometry
    ? [
        { opacity: 1, offset: 0, easing: "linear" },
        { opacity: 1, offset: edge / 100, easing: "linear" },
        { opacity: 1, offset: exit / 100, easing: exitCurve },
        { opacity: 0, offset: 1 },
      ]
    : [
        { opacity: startAlpha, offset: 0, easing: enterCurve },
        { opacity: coverAlpha, offset: edge / 100, easing: "linear" },
        { opacity: coverAlpha, offset: exit / 100, easing: exitCurve },
        { opacity: endAlpha, offset: 1 },
      ];
  const formatSeconds = (milliseconds) =>
    `${(milliseconds / 1000).toFixed(1)}秒`;
  enterSegment.style.flexGrow = enter;
  holdSegment.style.flexGrow = hold;
  exitSegment.style.flexGrow = exitDurationMs;
  enterSegmentValue.textContent = formatSeconds(enter);
  holdSegmentValue.textContent = formatSeconds(hold);
  exitSegmentValue.textContent = formatSeconds(exitDurationMs);
  timingTotal.textContent = `合計 ${formatSeconds(total)}`;
  dynamicAnimations.textContent = `
    @keyframes opacityRoundtrip { 0%{opacity:${startAlpha};animation-timing-function:${enterCurve}} ${edge}%{opacity:${coverAlpha};animation-timing-function:linear} ${exit}%{opacity:${coverAlpha};animation-timing-function:${exitCurve}} 100%{opacity:${endAlpha}} }
    @keyframes wipeRoundtrip { 0%{transform:scaleX(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scaleX(1);animation-timing-function:linear} ${exit}%{transform:scaleX(1);animation-timing-function:${exitCurve}} 100%{transform:scaleX(0)} }
    @keyframes wipeVerticalRoundtrip { 0%{transform:scaleY(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scaleY(1);animation-timing-function:linear} ${exit}%{transform:scaleY(1);animation-timing-function:${exitCurve}} 100%{transform:scaleY(0)} }
    @keyframes splitRoundtrip { 0%{transform:scaleY(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scaleY(1);animation-timing-function:linear} ${exit}%{transform:scaleY(1);animation-timing-function:${exitCurve}} 100%{transform:scaleY(0)} }
    @keyframes blinkRoundtrip { 0%{--blink-open:85%;animation-timing-function:cubic-bezier(.55,.02,.45,1)} ${edge}%{--blink-open:0%;animation-timing-function:linear} ${exit}%{--blink-open:0%;animation-timing-function:cubic-bezier(.32,0,.2,1)} 100%{--blink-open:85%} }
    @keyframes blinkDoubleRoundtrip { 0%{--blink-open:85%} ${blinkAt(0.28)}%{--blink-open:0%} ${blinkAt(0.32)}%{--blink-open:0%} ${blinkAt(0.54)}%{--blink-open:85%} ${blinkAt(0.72)}%{--blink-open:85%} ${blinkAt(0.82)}%{--blink-open:78%} ${blinkAt(0.91)}%{--blink-open:42%} ${edge}%{--blink-open:0%;animation-timing-function:linear} ${exit}%{--blink-open:0%} ${blinkOutAt(0.18)}%{--blink-open:78%} ${blinkOutAt(0.28)}%{--blink-open:85%} ${blinkOutAt(0.55)}%{--blink-open:0%} ${blinkOutAt(0.60)}%{--blink-open:0%} 100%{--blink-open:85%} }
    @keyframes irisRoundtrip { 0%{clip-path:circle(0%);animation-timing-function:${enterCurve}} ${edge}%{clip-path:circle(75%);animation-timing-function:linear} ${exit}%{clip-path:circle(75%);animation-timing-function:${exitCurve}} 100%{clip-path:circle(0%)} }
    @keyframes irisOutsideRoundtrip { 0%{--iris-hole:100%;animation-timing-function:${enterCurve}} ${edge}%{--iris-hole:0%;animation-timing-function:linear} ${exit}%{--iris-hole:0%;animation-timing-function:${exitCurve}} 100%{--iris-hole:100%} }
    @keyframes irisContinueInside { 0%{--iris-hole:0%;--iris-cover:0%;animation-timing-function:${enterCurve}} ${edge}%{--iris-hole:0%;--iris-cover:100%;animation-timing-function:linear} ${exit}%{--iris-hole:0%;--iris-cover:100%;animation-timing-function:${exitCurve}} 100%{--iris-hole:100%;--iris-cover:100%} }
    @keyframes irisContinueOutside { 0%{--iris-hole:100%;--iris-cover:100%;animation-timing-function:${enterCurve}} ${edge}%{--iris-hole:0%;--iris-cover:100%;animation-timing-function:linear} ${exit}%{--iris-hole:0%;--iris-cover:100%;animation-timing-function:${exitCurve}} 100%{--iris-hole:0%;--iris-cover:0%} }
    @keyframes zoomRoundtrip { 0%{transform:scale(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scale(1);animation-timing-function:linear} ${exit}%{transform:scale(1);animation-timing-function:${exitCurve}} 100%{transform:scale(0)} }
    @keyframes radialRoundtrip { 0%{--sweep:0deg;animation-timing-function:${enterCurve}} ${edge}%{--sweep:360deg;animation-timing-function:linear} ${exit}%{--sweep:360deg;animation-timing-function:${exitCurve}} 100%{--sweep:0deg} }
    @keyframes radialContinue { 0%{--radial-hole:0deg;--radial-cover:0deg;animation-timing-function:${enterCurve}} ${edge}%{--radial-hole:0deg;--radial-cover:360deg;animation-timing-function:linear} ${exit}%{--radial-hole:0deg;--radial-cover:360deg;animation-timing-function:${exitCurve}} 100%{--radial-hole:360deg;--radial-cover:360deg} }
    @keyframes partRoundtrip { 0%{transform:scaleY(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scaleY(1);animation-timing-function:linear} ${exit}%{transform:scaleY(1);animation-timing-function:${exitCurve}} 100%{transform:scaleY(0)} }
    @keyframes tileRoundtrip { 0%{transform:scale(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scale(1);animation-timing-function:linear} ${exit}%{transform:scale(1);animation-timing-function:${exitCurve}} 100%{transform:scale(0)} }
    @keyframes wipeContinue { 0%{transform:translateX(var(--travel-start));animation-timing-function:${enterCurve}} ${edge}%{transform:translateX(0);animation-timing-function:linear} ${exit}%{transform:translateX(0);animation-timing-function:${exitCurve}} 100%{transform:translateX(var(--travel-end))} }
    @keyframes wipeVerticalContinue { 0%{transform:translateY(var(--travel-start));animation-timing-function:${enterCurve}} ${edge}%{transform:translateY(0);animation-timing-function:linear} ${exit}%{transform:translateY(0);animation-timing-function:${exitCurve}} 100%{transform:translateY(var(--travel-end))} }
    @keyframes splitTopContinue { 0%{transform:translateY(100%);animation-timing-function:${enterCurve}} ${edge}%{transform:translateY(0);animation-timing-function:linear} ${exit}%{transform:translateY(0);animation-timing-function:${exitCurve}} 100%{transform:translateY(-100%)} }
    @keyframes splitBottomContinue { 0%{transform:translateY(-100%);animation-timing-function:${enterCurve}} ${edge}%{transform:translateY(0);animation-timing-function:linear} ${exit}%{transform:translateY(0);animation-timing-function:${exitCurve}} 100%{transform:translateY(100%)} }
    @keyframes partContinue { 0%{transform:translateY(-100%);animation-timing-function:${enterCurve}} ${edge}%{transform:translateY(0);animation-timing-function:linear} ${exit}%{transform:translateY(0);animation-timing-function:${exitCurve}} 100%{transform:translateY(100%)} }
    @keyframes wipeHold { 0%{transform:scaleX(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scaleX(1)} 100%{transform:scaleX(1)} }
    @keyframes wipeVerticalHold { 0%{transform:scaleY(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scaleY(1)} 100%{transform:scaleY(1)} }
    @keyframes splitHold { 0%{transform:scaleY(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scaleY(1)} 100%{transform:scaleY(1)} }
    @keyframes blinkHold { 0%{--blink-open:85%;animation-timing-function:cubic-bezier(.55,.02,.45,1)} ${edge}%{--blink-open:0%} 100%{--blink-open:0%} }
    @keyframes blinkDoubleHold { 0%{--blink-open:85%} ${blinkAt(0.28)}%{--blink-open:0%} ${blinkAt(0.32)}%{--blink-open:0%} ${blinkAt(0.54)}%{--blink-open:85%} ${blinkAt(0.72)}%{--blink-open:85%} ${blinkAt(0.82)}%{--blink-open:78%} ${blinkAt(0.91)}%{--blink-open:42%} ${edge}%{--blink-open:0%} 100%{--blink-open:0%} }
    @keyframes irisHold { 0%{clip-path:circle(0%);animation-timing-function:${enterCurve}} ${edge}%{clip-path:circle(75%)} 100%{clip-path:circle(75%)} }
    @keyframes irisOutsideHold { 0%{--iris-hole:100%;animation-timing-function:${enterCurve}} ${edge}%{--iris-hole:0%} 100%{--iris-hole:0%} }
    @keyframes zoomHold { 0%{transform:scale(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scale(1)} 100%{transform:scale(1)} }
    @keyframes radialHold { 0%{--sweep:0deg;animation-timing-function:${enterCurve}} ${edge}%{--sweep:360deg} 100%{--sweep:360deg} }
    @keyframes partHold { 0%{transform:scaleY(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scaleY(1)} 100%{transform:scaleY(1)} }
    @keyframes tileHold { 0%{transform:scale(0);animation-timing-function:${enterCurve}} ${edge}%{transform:scale(1)} 100%{transform:scale(1)} }
  `;
  renderPreviewTimeline(total, enter, hold, true);
  return total;
}

function replay(options = {}) {
  const revision = ++replayRevision;
  if (options?.preserveControlLayout !== true) updateOpacityControls();
  const totalDuration = updateRoundtripTiming();
  previewDuration = totalDuration;
  buildEffectParts(totalDuration);
  const [title, summary] = presetDetails[kind.value];
  previewTitle.textContent = title;
  presetSummary.textContent = summary;
  durationValue.textContent = `${Number(duration.value).toFixed(1)}秒`;
  layer.style.setProperty("--c", color.value);
  layer.style.setProperty("--d", `${totalDuration}ms`);
  layer.style.setProperty("--e", curveCssValue(easingPoints));
  const recipe = selectedCompoundRecipe();
  const baseKind = effectiveKind();
  layer.dataset.kind = recipe ? "compound" : baseKind;
  layer.dataset.recipe = recipe?.id || "";
  layer.dataset.direction = direction.value;
  layer.dataset.canvasPreview =
    (["wipe", "split", "stripe", "tile", "iris", "multi-iris", "radial", "zoom", "blink"].includes(
      baseKind,
    ) || (previewMatchFps.checked && baseKind === "fade")) && !recipe
      ? "true"
      : "false";
  layer.dataset.irisDirection = irisDirection.value;
  layer.dataset.blinkPattern = blinkPattern.value;
  layer.dataset.blinkBalance = blinkBalance.value;
  layer.dataset.tileDirection = tileDirection.value;
  updateBlinkPreviewFeather();
  layer.dataset.opacityMode = opacityMode.value;
  layer.dataset.forceOpaque =
    baseKind !== "fade" && forceOpaque.checked ? "true" : "false";
  layer.dataset.exitStyle = exitStyle.value;
  layer.dataset.phase =
    Number(startOpacity.value) > Number(endOpacity.value) ? "out" : "in";
  layer.style.setProperty("--from-opacity", Number(startOpacity.value) / 100);
  layer.style.setProperty("--to-opacity", Number(endOpacity.value) / 100);
  layer.style.setProperty(
    "--count",
    Math.max(
      1,
      Math.min(64, Number(document.querySelector("#count").value) || 8),
    ),
  );
  const travel =
    direction.value === "left" || direction.value === "up"
      ? ["100%", "-100%"]
      : ["-100%", "100%"];
  layer.style.setProperty("--travel-start", travel[0]);
  layer.style.setProperty("--travel-end", travel[1]);
  layer.style.setProperty("--radial-start", `${radialStart.value}deg`);
  layer.classList.remove("playing");
  void layer.offsetWidth;
  layer.classList.add("playing");
  if (activeOpacityAnimation) activeOpacityAnimation.cancel();
  layer.style.animation = "none";
  if (
    recipe || layer.dataset.canvasPreview === "true"
  ) {
    layer.style.opacity = "1";
    activeOpacityAnimation = layer.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: totalDuration,
      fill: "both",
    });
    renderCompoundFrame(0);
  } else if (
    layer.dataset.forceOpaque === "true" &&
    exitStyle.value !== "fade"
  ) {
    layer.style.opacity = "1";
    activeOpacityAnimation = null;
  } else {
    activeOpacityAnimation = layer.animate(opacityFrames, {
      duration: totalDuration,
      fill: "both",
    });
  }
  requestAnimationFrame(() => collectPreviewAnimations(revision));
}

let numericReplayTimer = 0;
function replayFromControl(control) {
  if (control?.matches?.('input[type="number"]')) {
    clearTimeout(numericReplayTimer);
    numericReplayTimer = setTimeout(replay, 650);
    return;
  }
  replay();
}
[
  duration,
  direction,
  wipeAngle,
  irisDirection,
  irisTiming,
  multiIrisLayers,
  multiIrisStagger,
  edgeFeather,
  zoomDirection,
  radialStart,
  radialDirection,
  tileDirection,
  blinkBalance,
  enterDuration,
  holdDuration,
  exitDuration,
  exitStyle,
  document.querySelector("#count"),
].forEach((el) => el.addEventListener("input", () => replayFromControl(el)));

[fogScale, fogDensity, fogTurbulence, fogFeather, fogDrift, fogSeed].forEach((control) =>
  control.addEventListener("input", () => {
    updateFogControls();
    replayFromControl(control);
  }),
);

const colorPickers = [color, multiIrisColor1, multiIrisColor2, multiIrisColor3];
function replayFromColorPicker() {
  replay({ preserveControlLayout: true });
}
colorPickers.forEach((picker) => {
  picker.addEventListener("input", replayFromColorPicker);
});

stripeStaggerSlider.addEventListener("input", () => {
  stripeStagger.value = stripeStaggerSlider.value;
  setPreviewPosition(Number(previewSeek.value) || 0);
  refreshAutomaticFileName();
});
stripeStaggerSlider.addEventListener("change", replay);
stripeStagger.addEventListener("input", () => {
  const value = Math.max(0, Math.min(50, Number(stripeStagger.value) || 0));
  stripeStagger.value = String(value);
  stripeStaggerSlider.value = String(value);
  replayFromControl(stripeStagger);
  refreshAutomaticFileName();
});
stripeStaggerPattern.addEventListener("input", () => {
  replayFromControl(stripeStaggerPattern);
  refreshAutomaticFileName();
});
opacityModeSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-opacity-mode]");
  if (!button) return;
  const previousMode = opacityMode.value;
  const nextMode = button.dataset.opacityMode;
  if (
    adjustOpacity.checked &&
    ["cover", "reveal"].includes(previousMode) &&
    ["cover", "reveal"].includes(nextMode) &&
    previousMode !== nextMode
  ) {
    [startOpacity.value, endOpacity.value] = [endOpacity.value, startOpacity.value];
  }
  opacityMode.value = nextMode;
  opacityMode.dispatchEvent(new Event("input", { bubbles: true }));
});
wipeDirectionSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-angle]");
  if (!button) return;
  wipeAngle.value = button.dataset.angle;
  const directions = { 0: "right", 90: "down", 180: "left", 270: "up" };
  direction.value = directions[button.dataset.angle];
  replay();
});
wipeAngle.addEventListener("input", () => {
  const angle = (((Number(wipeAngle.value) || 0) % 360) + 360) % 360;
  const directions = { 0: "right", 90: "down", 180: "left", 270: "up" };
  if (directions[angle] !== undefined) direction.value = directions[angle];
  wipeDirectionSwitch.querySelectorAll("button").forEach((button) => {
    const active = Number(button.dataset.angle) === angle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
});
blinkPattern.addEventListener("input", () => {
  applyBlinkRecommendedTiming();
  replay();
});
blinkFeatherSlider.addEventListener("input", () => {
  blinkFeather.value = blinkFeatherSlider.value;
  setPreviewPosition(Number(previewSeek.value) || 0);
  refreshAutomaticFileName();
});
blinkFeatherSlider.addEventListener("change", replay);
blinkFeather.addEventListener("input", () => {
  const value = blinkFeatherPercent();
  blinkFeather.value = String(value);
  blinkFeatherSlider.value = String(value);
  replayFromControl(blinkFeather);
  refreshAutomaticFileName();
});
edgeFeatherSlider.addEventListener("input", () => {
  edgeFeather.value = edgeFeatherSlider.value;
  setPreviewPosition(Number(previewSeek.value) || 0);
  refreshAutomaticFileName();
});
edgeFeatherSlider.addEventListener("change", replay);
edgeFeather.addEventListener("input", () => {
  const value = Math.max(0, Math.min(5, Number(edgeFeather.value) || 0));
  edgeFeather.value = String(value);
  edgeFeatherSlider.value = String(value);
  replayFromControl(edgeFeather);
  refreshAutomaticFileName();
});
[startOpacity, endOpacity].forEach((input) =>
  input.addEventListener("input", () => {
    adjustOpacity.checked = true;
    forceOpaque.checked = false;
    replayFromControl(input);
  }),
);
adjustOpacity.addEventListener("input", () => {
  if (adjustOpacity.checked) forceOpaque.checked = false;
  replay();
});
kind.addEventListener("input", () => {
  const recipe = selectedCompoundRecipe();
  const baseKind = effectiveKind();
  exitStyle.value =
    ["wipe", "split", "stripe", "iris", "multi-iris", "radial"].includes(baseKind) && !recipe
      ? "continue"
      : "reverse";
  if (baseKind === "blink" && !recipe) applyBlinkRecommendedTiming();
  if (baseKind === "multi-iris" && !recipe) {
    irisTiming.value = "accelerated";
    duration.value = "1.2";
  }
  if (recipe) {
    duration.value = (recipe.durationMs / 1000).toFixed(1);
    forceOpaque.checked = baseKind !== "fade";
    applyFogRecipeDefaults(recipe);
  }
  replay();
});
easing.addEventListener("input", () => {
  if (easing.value !== "custom")
    easingPoints.splice(0, 4, ...easingPresets[easing.value]);
  renderEasingGraph();
  replay();
});
exitEasing.addEventListener("input", () => {
  if (exitEasing.value !== "custom")
    exitEasingPoints.splice(0, 4, ...easingPresets[exitEasing.value]);
  renderExitEasingGraph();
  replay();
});
customExitEasing.addEventListener("input", () => {
  if (customExitEasing.checked && !exitEasingInitialized) {
    const automaticPoints = reversedCurve(easingPoints);
    const matchingPreset = Object.entries(easingPresets).find(([, points]) =>
      points.every(
        (value, index) => Math.abs(value - automaticPoints[index]) < 0.0001,
      ),
    );
    exitEasing.value = matchingPreset ? matchingPreset[0] : "custom";
    exitEasingPoints.splice(0, 4, ...automaticPoints);
    exitEasingInitialized = true;
    renderExitEasingGraph();
  }
  replay();
});
matchExitDuration.addEventListener("input", replay);
opacityMode.addEventListener("input", () => {
  if (kind.value === "blink") applyBlinkRecommendedTiming();
  if (opacityMode.value === "custom") adjustOpacity.checked = true;
  replay();
});
forceOpaque.addEventListener("input", () => {
  if (forceOpaque.checked) adjustOpacity.checked = false;
  if (forceOpaque.checked) advancedTimeline.checked = false;
  replay();
});
advancedTimeline.addEventListener("input", () => {
  if (advancedTimeline.checked) forceOpaque.checked = false;
  replay();
  refreshAutomaticFileName();
});
matchTimelineEndOpacity.addEventListener("input", replay);
[timelineStartOpacity, timelineCoverOpacity, timelineEndOpacity].forEach(
  (input) => input.addEventListener("input", () => {
    replayFromControl(input);
    refreshAutomaticFileName();
  }),
);
document.querySelector("#play").addEventListener("click", replay);
previewToggle.addEventListener("click", () => {
  if (!previewAnimations.length) {
    replay();
    return;
  }
  const current = Number(previewAnimations[0].currentTime) || 0;
  if (!previewPaused && current < previewDuration) {
    previewAnimations.forEach((animation) => animation.pause());
    previewPaused = true;
    previewToggle.textContent = "再生";
    renderPreviewTime(current);
    return;
  }
  if (current >= previewDuration)
    previewAnimations.forEach((animation) => {
      animation.currentTime = 0;
    });
  previewAnimations.forEach((animation) => animation.play());
  previewPaused = false;
  previewToggle.textContent = "一時停止";
  trackPreviewTime();
});
previewSeek.addEventListener("input", () =>
  setPreviewPosition(Number(previewSeek.value)),
);
const seekFromTimeline = (event) => {
  if (event.target.classList.contains("timeline-point")) return;
  const bounds = previewTimelineGraph.getBoundingClientRect();
  const ratio = Math.max(
    0,
    Math.min(1, (event.clientX - bounds.left) / bounds.width),
  );
  setPreviewPosition(ratio * previewDuration);
};
previewTimelineGraph.addEventListener("pointerdown", (event) => {
  previewTimelineGraph.setPointerCapture(event.pointerId);
  seekFromTimeline(event);
});
previewTimelineGraph.addEventListener("pointermove", (event) => {
  if (previewTimelineGraph.hasPointerCapture(event.pointerId))
    seekFromTimeline(event);
});
previewBackground.addEventListener("input", updatePreviewBackground);
previewBackgroundColor.addEventListener("input", updatePreviewBackground);
enableCurveDrag(
  easingGraph,
  easingPoint1,
  0,
  easingPoints,
  easing,
  renderEasingGraph,
);
enableCurveDrag(
  easingGraph,
  easingPoint2,
  2,
  easingPoints,
  easing,
  renderEasingGraph,
);
enableCurveDrag(
  exitEasingGraph,
  exitEasingPoint1,
  0,
  exitEasingPoints,
  exitEasing,
  renderExitEasingGraph,
);
enableCurveDrag(
  exitEasingGraph,
  exitEasingPoint2,
  2,
  exitEasingPoints,
  exitEasing,
  renderExitEasingGraph,
);
enableTimelineOpacityDrag(timelineStartPoint, timelineStartOpacity);
enableTimelineOpacityDrag(timelineCoverPoint, timelineCoverOpacity);
enableTimelineOpacityDrag(timelineEndPoint, timelineEndOpacity);
renderEasingGraph();
renderExitEasingGraph();
updatePreviewBackground();
replay();

function exportState() {
  const roundtrip = opacityMode.value === "roundtrip";
  const durationMs = roundtrip
    ? (Number(enterDuration.value) +
        Number(holdDuration.value) +
        Number(exitDuration.value)) *
      1000
    : Number(duration.value) * 1000;
  return {
    kind: effectiveKind(),
    color: color.value,
    durationMs,
    recipeId: selectedCompoundRecipe()?.id || null,
    opacityMode: opacityMode.value,
    startOpacity: roundtrip
      ? advancedTimeline.checked
        ? Number(timelineStartOpacity.value) / 100
        : 0
      : Number(startOpacity.value) / 100,
    coverOpacity: roundtrip
      ? advancedTimeline.checked
        ? Number(timelineCoverOpacity.value) / 100
        : 1
      : 1,
    endOpacity: roundtrip
      ? advancedTimeline.checked
        ? Number(timelineEndOpacity.value) / 100
        : 0
      : Number(endOpacity.value) / 100,
    enterMs: Number(enterDuration.value) * 1000,
    holdMs: Number(holdDuration.value) * 1000,
    exitMs: Number(exitDuration.value) * 1000,
    easing: [...easingPoints],
    exitEasing: customExitEasing.checked
      ? [...exitEasingPoints]
      : reversedCurve(easingPoints),
    forceOpaque: effectiveKind() !== "fade" && forceOpaque.checked,
    exitStyle: exitStyle.value,
    direction: direction.value,
    wipeAngle: Number(wipeAngle.value),
    irisDirection: irisDirection.value,
    irisTiming: irisTiming.value,
    multiIrisLayers: Number(multiIrisLayers.value),
    multiIrisStagger: Number(multiIrisStagger.value) / 100,
    multiIrisColors: [multiIrisColor1.value, multiIrisColor2.value, multiIrisColor3.value],
    edgeFeatherPercent: Number(edgeFeather.value),
    fogSeed: Number(fogSeed.value) || selectedCompoundRecipe()?.seed || 8127,
    fogScale: Number(fogScale.value),
    fogDensity: Number(fogDensity.value),
    fogTurbulence: Number(fogTurbulence.value),
    fogFeather: Number(fogFeather.value),
    fogDrift: Number(fogDrift.value),
    zoomDirection: zoomDirection.value,
    blinkPattern: blinkPattern.value,
    blinkBalance: blinkBalance.value,
    blinkFeatherPercent: blinkFeatherPercent(),
    radialStart: Number(radialStart.value),
    radialDirection: radialDirection.value,
    tileDirection: tileDirection.value,
    stripeStagger: Number(stripeStagger.value) / 100,
    stripeStaggerPattern: stripeStaggerPattern.value,
    count: Math.max(1, Number(document.querySelector("#count").value) || 8),
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const exportFormat = document.querySelector("#exportFormat");
const webmOption = document.querySelector("#webmOption");
const editionBadge = document.querySelector("#editionBadge");
const localOutputControl = document.querySelector("#localOutputControl");
const exportDestination = document.querySelector("#exportDestination");
const chooseExportDirectory = document.querySelector("#chooseExportDirectory");
const exportDirectoryStatus = document.querySelector("#exportDirectoryStatus");
const exportWidth = document.querySelector("#exportWidth");
const exportHeight = document.querySelector("#exportHeight");
const exportFps = document.querySelector("#exportFps");
const resolutionPreset = document.querySelector("#resolutionPreset");
const exportTarget = document.querySelector("#exportTarget");
const exportCustomTarget = document.querySelector("#exportCustomTarget");
const exportPriority = document.querySelector("#exportPriority");
const advancedBrowserOptimization = document.querySelector("#advancedBrowserOptimization");
const exportLoops = document.querySelector("#exportLoops");
const exportName = document.querySelector("#exportName");
const autoFileName = document.querySelector("#autoFileName");
const exportNameLanguage = document.querySelector("#exportNameLanguage");
const exportNameLanguageControl = document.querySelector("#exportNameLanguageControl");
const exportButton = document.querySelector("#exportButton");
const exportProgress = document.querySelector("#exportProgress");
const exportResult = document.querySelector("#exportResult");
const inspectExport = document.querySelector("#inspectExport");
const editorLayout = document.querySelector("#editorLayout");
const exportDockToggle = document.querySelector("#exportDockToggle");
const integratedExportDock = document.querySelector("#integratedExportDock");
const integratedSetPreviewDock = document.querySelector("#integratedSetPreviewDock");
const exportGrid = document.querySelector("#exportGrid");
const exportSettings = document.querySelector("#exportSettings");
const exportPreviewColumn = document.querySelector("#exportPreviewColumn");
const ccfSetPreview = document.querySelector("#ccfSetPreview");
const setPreviewDirection = document.querySelector("#setPreviewDirection");
const setPreviewPlay = document.querySelector("#setPreviewPlay");
let setPreviewAnimationFrame = 0;
let lastExport = null;
let exportDirectoryHandle = null;
let localEditionAvailable = false;

function ccfSetOpacity() {
  if (["split", "stripe"].includes(effectiveKind())) return 1;
  const input = document.querySelector("#ccfHoldOpacity");
  return Math.max(0, Math.min(1, Number(input?.value ?? 100) / 100));
}

function ccfSetShapeOpacity(baseState, setOpacity) {
  if (baseState.kind === "fade") return undefined;
  // Shape opacity and edge feather are independent:
  // when "force opaque" is enabled, the solid side of the moving edge
  // must remain alpha=1 while only the feather ramp is partially transparent.
  if (baseState.forceOpaque || ["split", "stripe"].includes(baseState.kind)) return 1;
  return setOpacity;
}

function setIntegratedExportMode(enabled) {
  editorLayout.classList.toggle("with-export-dock", enabled);
  integratedExportDock.hidden = !enabled;
  exportDockToggle.setAttribute("aria-pressed", String(enabled));
  exportDockToggle.classList.toggle("active", enabled);
  exportDockToggle.textContent = enabled
    ? "書き出しを元に戻す"
    : "書き出しを右に表示";

  if (enabled) {
    integratedExportDock.append(exportSettings);
    integratedSetPreviewDock.append(ccfSetPreview);
  } else {
    exportGrid.insertBefore(exportSettings, exportPreviewColumn);
    exportPreviewColumn.insertBefore(ccfSetPreview, exportPreviewColumn.firstChild);
  }

  integratedSetPreviewDock.hidden = !enabled || ccfSetPreview.hidden;
  updateExportControls();
}

exportDockToggle.addEventListener("click", () => {
  setIntegratedExportMode(exportDockToggle.getAttribute("aria-pressed") !== "true");
});

function setDirectionDefinitions(baseKind) {
  if (baseKind === "wipe") return [["0", "左から右へ"], ["180", "右から左へ"], ["90", "上から下へ"], ["270", "下から上へ"]];
  if (baseKind === "iris") return [["inside-out", "中心から外側へ"], ["outside-in", "外側から中心へ"]];
  if (baseKind === "zoom") return [["center-out", "中央から外側へ"], ["outside-in", "外側から中央へ"]];
  if (baseKind === "tile") return [...tileDirection.options].map((option) => [option.value, option.textContent]);
  if (baseKind === "radial") return [["clockwise", "時計回り"], ["counterclockwise", "反時計回り"]];
  if (baseKind === "split") return [["vertical-center", "中央から上下へ"], ["vertical-edges", "上下から中央へ"], ["horizontal-center", "中央から左右へ"], ["horizontal-edges", "左右から中央へ"]];
  if (baseKind === "stripe") return [["right", "左から右へ"], ["left", "右から左へ"], ["down", "上から下へ"], ["up", "下から上へ"]];
  return [];
}

function renderSetPreview(progress = .55) {
  if (ccfSetPreview.hidden) return;
  const base = exportState();
  const setOpacity = ccfSetOpacity();
  const durationMs = base.opacityMode === "roundtrip" ? base.enterMs : base.durationMs;
  const fps = Math.max(5, Math.min(60, Number(exportFps.value) || 30));
  const frameDuration = 1000 / fps;
  const previewTimeMs = previewMatchFps.checked && progress < 1
    ? Math.floor(durationMs * progress / frameDuration) * frameDuration
    : durationMs * progress;
  const fixedOpaque = base.forceOpaque || ["split", "stripe"].includes(base.kind);
  const shapeOpacity = ccfSetShapeOpacity(base, setOpacity);
  const outState = { ...base, opacityMode: "cover", durationMs, startOpacity: 0, endOpacity: setOpacity, forceOpaque: fixedOpaque, shapeOpacity };
  const inState = { ...base, opacityMode: "reveal", durationMs, startOpacity: setOpacity, endOpacity: 0, forceOpaque: fixedOpaque, shapeOpacity };
  const samples = [["setPreviewOut", outState, previewTimeMs], ["setPreviewHold", outState, durationMs], ["setPreviewIn", inState, previewTimeMs]];
  for (const [id, renderState, timeMs] of samples) {
    const canvas = document.querySelector(`#${id}`); canvas.width = 320; canvas.height = 180;
    renderTransitionFrame(canvas.getContext("2d"), 320, 180, timeMs, renderState);
  }
}

function syncSetPreviewDirection() {
  const baseKind = effectiveKind();
  const definitions = setDirectionDefinitions(baseKind);
  const current = baseKind === "wipe" ? String(wipeAngle.value) : baseKind === "iris" ? irisDirection.value : baseKind === "zoom" ? zoomDirection.value : baseKind === "tile" ? tileDirection.value : baseKind === "radial" ? radialDirection.value : direction.value;
  setPreviewDirection.replaceChildren(...definitions.map(([value, label]) => new Option(label, value)));
  if (definitions.some(([value]) => value === current)) setPreviewDirection.value = current;
  setPreviewDirection.closest("label").hidden = definitions.length === 0;
}

function updateExportControls() {
  const optimizable = ["webp", "webm", "ccfset-webp"].includes(
    exportFormat.value,
  );
  const browserWebp = ["webp", "ccfset-webp"].includes(exportFormat.value);
  const advancedWebp = exportFormat.value === "webp" && advancedBrowserOptimization.checked;
  ccfSetPreview.hidden = !["ccfset-apng", "ccfset-webp"].includes(exportFormat.value);
  integratedSetPreviewDock.hidden =
    exportDockToggle.getAttribute("aria-pressed") !== "true" || ccfSetPreview.hidden;
  if (!ccfSetPreview.hidden) { syncSetPreviewDirection(); requestAnimationFrame(renderSetPreview); }
  exportTarget.disabled = !optimizable;
  exportPriority.disabled =
    !optimizable || exportTarget.value === "unlimited" || (browserWebp && !advancedWebp);
  exportLoops.disabled = exportFormat.value === "webm";
  exportLoops.title =
    exportFormat.value === "webm" ? "WebMのループは再生側で設定します" : "";
  document.querySelector("#exportTargetControl").hidden = !optimizable;
  document.querySelector("#optimizationPriorityControl").hidden = !optimizable;
  document.querySelector("#optimizationPriorityHelp").hidden = !optimizable;
  document.querySelector("#advancedBrowserOptimizationControl").hidden = exportFormat.value !== "webp";
  document.querySelector("#exportLoopsControl").hidden =
    exportFormat.value === "webm";
  document.querySelector("#customTargetControl").hidden =
    !optimizable || exportTarget.value !== "custom";
  const guides = {
    apng: "GitHub Pages・ブラウザ単体で書き出し可能。可逆圧縮のため画質スライダーはなく、現在は容量指定の対象外です。",
    webp: "Animated WebP。GitHub Pages・ブラウザ単体で書き出し可能。容量指定時は圧縮品質を段階的に調整します。",
    webm: "VP9 alpha WebM。ローカル版で利用できます。ループはOBSなど再生側で設定します。",
    "ccfset-apng":
      "OUT（透明→幕）＋HOLD（固定PNG）＋IN（OUTの挙動反転）をZIP化。GitHub Pages対応。",
    "ccfset-webp":
      "OUT（透明→幕）＋HOLD（固定PNG）＋IN（OUTの挙動反転）をブラウザ内で作成してZIP化。容量上限はOUTとINの各ファイルに適用します。",
    pngzip:
      "各フレームをPNGでZIP化。GitHub Pages・ブラウザ単体で書き出し可能。",
  };
  document.querySelector("#formatCompatibility").textContent =
    guides[exportFormat.value];
  const priorityGuides = {
    auto: "自動：圧縮品質・FPS・幅/高さをバランスよく探索します。",
    quality:
      "画質優先：圧縮品質をなるべく維持し、必要ならFPSと幅/高さを下げます。",
    fps: "FPS優先：滑らかさをなるべく維持し、圧縮品質と幅/高さを調整します。",
    resolution:
      "解像度優先：幅/高さをなるべく維持し、圧縮品質とFPSを調整します。",
  };
  const priorityHelp = document.querySelector("#optimizationPriorityHelp");
  priorityHelp.textContent = browserWebp && !advancedWebp
    ? "標準：幅/高さとFPSは維持し、圧縮品質だけを調整します。目標を超えた場合は警告します。"
    : browserWebp
      ? `発展的：${priorityGuides[exportPriority.value]} 目標以下になるまでブラウザ内で探索します。`
    : priorityGuides[exportPriority.value];
  exportPriority.title = priorityHelp.textContent;
}

async function detectLocalWebmSupport() {
  if (!webmOption) return;
  try {
    const response = await fetch("/api/capabilities", { cache: "no-store" });
    if (!response.ok) return;
    const capabilities = await response.json();
    localEditionAvailable = capabilities.edition === "local";
    if (localEditionAvailable) {
      document.documentElement.dataset.edition = "local";
      editionBadge.textContent = "v0.2 Beta・ローカル版";
    }
    const directFolderAvailable =
      localEditionAvailable &&
      capabilities.directFolder &&
      typeof window.showDirectoryPicker === "function";
    localOutputControl.hidden = !directFolderAvailable;
    if (capabilities.ffmpeg && capabilities.formats?.includes("webm")) {
      webmOption.disabled = false;
      webmOption.textContent = "WebM（VP9 alpha・ローカル）";
      obsFormatHint.textContent = "ローカル版ではWebP・APNG・PNG連番に加えて、OBS向けVP9 alpha WebMへ書き出せます。「入り → 保持 → 抜け」の連続素材として利用できます。";
    } else if (localEditionAvailable) {
      webmOption.textContent = "WebM（FFmpegが見つかりません）";
      obsFormatHint.textContent = "WebMを利用するにはFFmpegをPATHへ追加してください。WebP・APNG・PNG連番はそのまま書き出せます。";
    }
    updateOpacityControls();
    updateExportControls();
  } catch {}
}

async function chooseLocalExportDirectory() {
  if (!localEditionAvailable || typeof window.showDirectoryPicker !== "function") {
    throw new Error("フォルダ直接保存はローカル版のChrome / Edgeで利用できます");
  }
  exportDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  exportDirectoryStatus.textContent = `出力先：${exportDirectoryHandle.name}（同名は自動連番）`;
  return exportDirectoryHandle;
}

function numberedFileName(fileName, number) {
  if (number < 2) return fileName;
  const dot = fileName.lastIndexOf(".");
  return dot > 0
    ? `${fileName.slice(0, dot)}_${number}${fileName.slice(dot)}`
    : `${fileName}_${number}`;
}

async function unusedFileName(directoryHandle, fileName) {
  for (let number = 1; number < 10000; number += 1) {
    const candidate = numberedFileName(fileName, number);
    try {
      await directoryHandle.getFileHandle(candidate);
    } catch (error) {
      if (error.name === "NotFoundError") return candidate;
      throw error;
    }
  }
  throw new Error("同名ファイルの連番上限に達しました");
}

async function saveFilesToDirectory(files) {
  const directoryHandle = exportDirectoryHandle || await chooseLocalExportDirectory();
  const savedNames = [];
  for (const file of files) {
    const name = await unusedFileName(directoryHandle, file.name);
    const handle = await directoryHandle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.data);
    await writable.close();
    savedNames.push(name);
  }
  exportDirectoryStatus.textContent = `出力先：${directoryHandle.name}（${savedNames.length}ファイル保存済み）`;
  return savedNames;
}

chooseExportDirectory.addEventListener("click", async () => {
  try {
    await chooseLocalExportDirectory();
  } catch (error) {
    if (error.name !== "AbortError") exportDirectoryStatus.textContent = error.message;
  }
});

exportDestination.addEventListener("input", () => {
  chooseExportDirectory.hidden = exportDestination.value !== "folder";
  exportDirectoryStatus.hidden = exportDestination.value !== "folder";
});
chooseExportDirectory.hidden = true;
exportDirectoryStatus.hidden = true;

exportFormat.addEventListener("input", updateExportControls);
exportFormat.addEventListener("input", refreshAutomaticFileName);
exportTarget.addEventListener("input", updateExportControls);
exportPriority.addEventListener("input", updateExportControls);
advancedBrowserOptimization.addEventListener("input", updateExportControls);
previewMatchFps.addEventListener("input", replay);
exportFps.addEventListener("input", () => {
  if (previewMatchFps.checked) replayFromControl(exportFps);
  requestAnimationFrame(renderSetPreview);
});
detectLocalWebmSupport();
setPreviewDirection.addEventListener("input", () => {
  const baseKind = effectiveKind();
  if (baseKind === "wipe") wipeAngle.value = setPreviewDirection.value;
  else if (baseKind === "iris") irisDirection.value = setPreviewDirection.value;
  else if (baseKind === "zoom") zoomDirection.value = setPreviewDirection.value;
  else if (baseKind === "tile") tileDirection.value = setPreviewDirection.value;
  else if (baseKind === "radial") radialDirection.value = setPreviewDirection.value;
  else direction.value = setPreviewDirection.value;
  replay(); renderSetPreview(); refreshAutomaticFileName();
});
setPreviewPlay.addEventListener("click", () => {
  if (setPreviewAnimationFrame) {
    cancelAnimationFrame(setPreviewAnimationFrame); setPreviewAnimationFrame = 0;
    setPreviewPlay.textContent = "▶ 3つを再生";
    return;
  }
  const startedAt = performance.now();
  const durationMs = Math.max(100, exportState().opacityMode === "roundtrip" ? exportState().enterMs : exportState().durationMs);
  setPreviewPlay.textContent = "■ 停止";
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    renderSetPreview(progress);
    if (progress < 1) setPreviewAnimationFrame = requestAnimationFrame(tick);
    else { setPreviewAnimationFrame = 0; setPreviewPlay.textContent = "▶ 3つを再生"; }
  };
  setPreviewAnimationFrame = requestAnimationFrame(tick);
});
[kind, color, duration, enterDuration, exitDuration, direction, wipeAngle, irisDirection, irisTiming, multiIrisLayers, multiIrisStagger, multiIrisColor1, multiIrisColor2, multiIrisColor3, edgeFeather, stripeStagger, stripeStaggerPattern, zoomDirection, tileDirection, radialStart, radialDirection].forEach((control) => control.addEventListener("input", () => requestAnimationFrame(() => { syncSetPreviewDirection(); renderSetPreview(); })));
setIntegratedExportMode(true);

function totalExportSeconds() {
  return opacityMode.value === "roundtrip"
    ? Number(enterDuration.value) +
        Number(holdDuration.value) +
        Number(exitDuration.value)
    : Number(duration.value);
}

function buildAutomaticFileName() {
  const japanese = exportNameLanguage.value === "ja";
  const mode =
    { cover: japanese ? "OUT" : "cover", reveal: japanese ? "IN" : "reveal", roundtrip: "OBS", custom: japanese ? "調整" : "custom" }[
      opacityMode.value
    ] || opacityMode.value;
  const kindNames = {
    fade: "フェード", wipe: "ワイプ", split: "スプリット", blink: "まばたき",
    iris: "アイリス", "multi-iris": "多層アイリス", stripe: "ストライプ",
    tile: "タイル", radial: "ラジアル", zoom: "ズーム",
    "fog-fill": "霧フィル", "fog-sweep": "霧スイープ", "fog-bloom": "霧ブルーム",
  };
  const valueName = (value, names) => japanese ? (names[value] || value) : value;
  const details = [];
  if (effectiveKind() === "wipe")
    details.push(japanese ? `角度${Math.round(Number(wipeAngle.value) || 0)}度` : `${Math.round(Number(wipeAngle.value) || 0)}deg`);
  if (["wipe", "split", "stripe"].includes(effectiveKind()))
    details.push(japanese ? `ぼかし${Number(edgeFeather.value) || 0}％` : `feather${Number(edgeFeather.value) || 0}pct`);
  if (effectiveKind() === "stripe") details.push(
    valueName(direction.value, { right: "左から右", left: "右から左", down: "上から下", up: "下から上" }),
    japanese ? `開始ずれ${Number(stripeStagger.value) || 0}%` : `stagger${Number(stripeStagger.value) || 0}pct`,
    valueName(stripeStaggerPattern.value, { linear: "一定間隔", ease: "なめらかな間隔", alternating: "交互", random: "ランダム風" }),
  );
  if (selectedCompoundRecipe()?.id?.startsWith("fog-")) {
    details.push(valueName(direction.value, { right: "左から右", left: "右から左", down: "上から下", up: "下から上" }));
  }
  if (effectiveKind() === "iris") details.push(valueName(irisDirection.value, { "inside-out": "中央から外", "outside-in": "外から中央" }), valueName(irisTiming.value, { standard: "標準", linear: "線形", "soft-accelerated": "なだらか加速", accelerated: "加速" }));
  if (effectiveKind() === "multi-iris") details.push(japanese ? `${multiIrisLayers.value}層` : `${multiIrisLayers.value}layers`, valueName(irisTiming.value, { standard: "標準", linear: "線形", "soft-accelerated": "なだらか加速", accelerated: "加速" }));
  if (effectiveKind() === "zoom") details.push(valueName(zoomDirection.value, { "center-out": "中央から外", "outside-in": "外から中央" }));
  if (effectiveKind() === "blink")
    details.push(
      valueName(blinkPattern.value, { single: "ゆっくり閉じる", double: "ぱちっ本閉じ" }),
      valueName(blinkBalance.value, { center: "上下均等", natural: "人のまぶた比率" }),
      japanese ? `ぼかし${Number(blinkFeather.value) || 0}％` : `feather${Number(blinkFeather.value) || 0}pct`,
    );
  const singleStinger = opacityMode.value === "roundtrip" &&
    !["ccfset-webp", "ccfset-apng"].includes(exportFormat.value);
  const fullyCovered = !advancedTimeline.checked || Number(timelineCoverOpacity.value) >= 99.9;
  const holdMs = Math.max(0, Number(holdDuration.value) * 1000 || 0);
  if (singleStinger && fullyCovered && holdMs > 0) {
    const enterMs = Math.max(100, Number(enterDuration.value) * 1000 || 1000);
    details.push(`TP${stingerTransitionPointMs(enterMs, holdMs)}ms`);
  }
  const seconds = Number(totalExportSeconds().toFixed(2));
  return [
    japanese
      ? (kindNames[selectedCompoundRecipe()?.id || effectiveKind()] || selectedCompoundRecipe()?.id || effectiveKind())
      : (selectedCompoundRecipe()?.id || effectiveKind()),
    mode,
    ...details,
    japanese ? `${seconds}秒` : `${seconds}s`,
    `${exportWidth.value}x${exportHeight.value}`,
  ].join("_");
}

function refreshAutomaticFileName() {
  if (autoFileName.checked) exportName.value = buildAutomaticFileName();
}

resolutionPreset.addEventListener("input", () => {
  if (resolutionPreset.value !== "custom")
    [exportWidth.value, exportHeight.value] = resolutionPreset.value.split("x");
  refreshAutomaticFileName();
});
[exportWidth, exportHeight].forEach((input) =>
  input.addEventListener("input", () => {
    const value = `${exportWidth.value}x${exportHeight.value}`;
    resolutionPreset.value = [...resolutionPreset.options].some(
      (option) => option.value === value,
    )
      ? value
      : "custom";
    refreshAutomaticFileName();
  }),
);
autoFileName.addEventListener("input", () => {
  exportNameLanguageControl.hidden = !autoFileName.checked;
  refreshAutomaticFileName();
});
exportNameLanguage.addEventListener("input", refreshAutomaticFileName);
exportName.addEventListener("input", () => {
  if (document.activeElement === exportName) autoFileName.checked = false;
});
[
  kind,
  opacityMode,
  duration,
  enterDuration,
  holdDuration,
  exitDuration,
  direction,
  wipeAngle,
  irisDirection,
  irisTiming,
  multiIrisLayers,
  multiIrisStagger,
  edgeFeather,
  blinkPattern,
  blinkBalance,
].forEach((input) =>
  input.addEventListener("input", refreshAutomaticFileName),
);
refreshAutomaticFileName();

function decodeMetadataHeader(value) {
  if (!value) return null;
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0)),
    ),
  );
}

function optimizationTarget() {
  if (exportTarget.value === "1mb") return 950 * 1024;
  if (exportTarget.value === "5mb") return Math.floor(4.8 * 1024 * 1024);
  if (exportTarget.value === "custom")
    return Math.max(
      1024,
      Math.floor((Number(exportCustomTarget.value) || 1) * 1024 * 1024),
    );
  return 0;
}

async function makeEncoderPayload(
  context,
  width,
  height,
  fps,
  state,
  timings,
  loops,
  progressStart = 0,
  progressSpan = 0.45,
) {
  const totalDelayMs = timings.reduce((sum, timing) => sum + timing.delayMs, 0);
  const effectiveFps = Math.min(60, (timings.length * 1000) / totalDelayMs);
  const files = [
    {
      name: "manifest.json",
      data: new TextEncoder().encode(
        JSON.stringify({
          width,
          height,
          fps: effectiveFps,
          loops,
          frames: timings.map(({ delayMs }) => ({ delayMs })),
        }),
      ),
    },
  ];
  for (let index = 0; index < timings.length; index += 1) {
    renderTransitionFrame(context, width, height, timings[index].timeMs, state);
    files.push({
      name: `frame-${String(index).padStart(5, "0")}.png`,
      data: await encodePng(context.getImageData(0, 0, width, height)),
    });
    exportProgress.value =
      progressStart + (progressSpan * (index + 1)) / timings.length;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return encodeZip(files);
}

async function requestLocalEncode(payload, format, target = 0, priority = "auto") {
  const params = new URLSearchParams({
    format,
    targetBytes: String(target),
    priority,
  });
  const response = await fetch(`/api/encode?${params}`, {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: payload,
  });
  if (!response.ok) {
    let message = `エンコードサーバーが応答しません（HTTP ${response.status}）`;
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new Error(`${message}。WebMを利用できるローカル版から再試行してください`);
  }
  return {
    blob: await response.blob(),
    metadata: decodeMetadataHeader(
      response.headers.get("x-transition-options"),
    ),
  };
}

exportButton.addEventListener("click", async () => {
  const requestedFormat = exportFormat.value;
  const requestedDestination = exportDestination.value;
  const requestedTargetBytes = optimizationTarget();
  const requestedPriority = exportPriority.value;
  const requestedLoops = Math.max(0, Number(exportLoops.value) || 0);
  const requestedNameLanguage = exportNameLanguage.value;
  exportButton.disabled = true;
  inspectExport.disabled = true;
  exportFormat.disabled = true;
  exportDestination.disabled = true;
  exportProgress.value = 0;
  try {
    if (requestedDestination === "folder" && !exportDirectoryHandle) {
      await chooseLocalExportDirectory();
    }
    const width = Math.max(
      64,
      Math.min(3840, Number(exportWidth.value) || 960),
    );
    const height = Math.max(
      64,
      Math.min(2160, Number(exportHeight.value) || 540),
    );
    const fps = Math.max(5, Math.min(60, Number(exportFps.value) || 30));
    const state = exportState();
    const timings = frameTimes(state.durationMs, fps, state);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    refreshAutomaticFileName();
    const safeName = (exportName.value || "transition").replace(
      /[\\/:*?"<>|]+/g,
      "_",
    );
    let blob;
    let filename;
    let outputFiles = null;
    const endpointWarnings = [];
    const endpointState = (imageData, expectedAlpha) => {
      let transparent = true;
      let covered = true;
      let expected = true;
      for (let index = 3; index < imageData.data.length; index += 4) {
        const alpha = imageData.data[index];
        if (alpha !== 0) transparent = false;
        if (alpha !== 255) covered = false;
        if (alpha !== expectedAlpha) expected = false;
        if (!transparent && !covered && !expected) break;
      }
      return { transparent, covered, expected };
    };
    const ensureEndpoints = async (renderState, renderTimings, label = "素材") => {
      if (!renderTimings.length || renderState.opacityMode === "custom") return renderTimings;
      const expected = [renderState.startOpacity, renderState.endOpacity]
        .map((opacity) => Math.round(Math.max(0, Math.min(1, opacity)) * 255));
      const result = [...renderTimings];
      const frameDelay = Math.max(1, Math.round(1000 / fps));
      renderTransitionFrame(context, width, height, result[0].timeMs, renderState);
      if (!endpointState(context.getImageData(0, 0, width, height), expected[0]).expected) {
        result.unshift({ timeMs: 0, delayMs: frameDelay, endpointGuarantee: true });
        endpointWarnings.push(`${label}の先頭保証フレームを追加（+${frameDelay}ms）`);
      }
      renderTransitionFrame(context, width, height, result.at(-1).timeMs, renderState);
      if (!endpointState(context.getImageData(0, 0, width, height), expected[1]).expected) {
        result.push({ timeMs: renderState.durationMs, delayMs: frameDelay, endpointGuarantee: true });
        endpointWarnings.push(`${label}の末尾保証フレームを追加（+${frameDelay}ms）`);
      }
      return result;
    };
    const makeApng = async (
      renderState,
      renderTimings,
      progressStart = 0,
      progressSpan = 1,
    ) => {
      const safeTimings = await ensureEndpoints(renderState, renderTimings, renderState.opacityMode.toUpperCase());
      const frames = safeTimings.map((timing, index) => ({
        delayMs: timing.delayMs,
        getImageData: async () => {
          renderTransitionFrame(
            context,
            width,
            height,
            timing.timeMs,
            renderState,
          );
          exportProgress.value =
            progressStart +
            (progressSpan * (index + 0.5)) / safeTimings.length;
          await new Promise((resolve) => requestAnimationFrame(resolve));
          return context.getImageData(0, 0, width, height);
        },
      }));
      return encodeApng(
        frames,
        width,
        height,
        requestedLoops,
      );
    };
    const makeWebp = async (
      renderState,
      renderTimings,
      progressStart = 0,
      progressSpan = 1,
    ) => {
      const targetBytes = requestedTargetBytes;
      const advanced = requestedFormat === "webp" && advancedBrowserOptimization.checked && targetBytes > 0;
      const makeFrames = (safeTimings) => safeTimings.map((timing) => ({
        delayMs: timing.delayMs,
        getImageData: async () => {
          renderTransitionFrame(context, width, height, timing.timeMs, renderState);
          return context.getImageData(0, 0, width, height);
        },
      }));
      if (!advanced) {
        const safeTimings = await ensureEndpoints(renderState, renderTimings, renderState.opacityMode.toUpperCase());
        return encodeAnimatedWebpToTarget(() => makeFrames(safeTimings), width, height, {
          loops: requestedLoops, targetBytes,
          onProgress: (value) => { exportProgress.value = progressStart + progressSpan * value; },
        });
      }
      const weights = {
        auto: { quality: .4, fps: .3, resolution: .3 },
        quality: { quality: .62, fps: .15, resolution: .23 },
        fps: { quality: .3, fps: .55, resolution: .15 },
        resolution: { quality: .3, fps: .15, resolution: .55 },
      }[requestedPriority];
      const candidates = [];
      for (const scale of [1, .9, .75, .67, .5]) for (const candidateFps of [...new Set([fps, Math.min(fps, 24), Math.min(fps, 20), Math.min(fps, 15)])]) for (const quality of [.88, .78, .68, .58, .48, .4]) {
        const score = weights.quality * quality + weights.fps * candidateFps / fps + weights.resolution * scale;
        candidates.push({ width: Math.max(64, Math.round(width * scale / 2) * 2), height: Math.max(64, Math.round(height * scale / 2) * 2), fps: candidateFps, quality, score });
      }
      candidates.sort((left, right) => right.score - left.score);
      const searchCandidates = [...candidates.slice(0, 31), candidates.at(-1)];
      let last = null;
      for (let attempt = 0; attempt < searchCandidates.length; attempt += 1) {
        const candidate = searchCandidates[attempt];
        const candidateTimings = frameTimes(renderState.durationMs, candidate.fps, renderState);
        const safeTimings = await ensureEndpoints(renderState, candidateTimings, renderState.opacityMode.toUpperCase());
        const bytes = await encodeAnimatedWebp(makeFrames(safeTimings), candidate.width, candidate.height, {
          quality: candidate.quality,
          loops: requestedLoops,
          onProgress: (value) => { exportProgress.value = progressStart + progressSpan * (attempt + value) / searchCandidates.length; },
        });
        last = { bytes, ...candidate, attempts: attempt + 1, exceeded: bytes.length > targetBytes };
        if (bytes.length <= targetBytes) return last;
      }
      return last;
    };
    let encodedMetadata = null;
    if (requestedFormat === "webp") {
      exportResult.textContent = requestedTargetBytes
        ? "ブラウザ内で容量を調整中…"
        : "ブラウザ内でWebPを書き出し中…";
      const encoded = await makeWebp(state, timings);
      encodedMetadata = {
        width: encoded.width || width,
        height: encoded.height || height,
        fps: encoded.fps || fps,
        attempts: encoded.attempts,
        exceeded: encoded.exceeded,
        quality: encoded.quality,
      };
      blob = new Blob([encoded.bytes], { type: "image/webp" });
      filename = `${safeName}.webp`;
    } else if (requestedFormat === "webm") {
      const safeTimings = await ensureEndpoints(state, timings, "WebM");
      const payload = await makeEncoderPayload(
        context,
        width,
        height,
        fps,
        state,
        safeTimings,
        requestedLoops,
      );
      exportProgress.value = 0.5;
      exportResult.textContent = requestedTargetBytes
        ? "容量を探索中…（複数回エンコードします）"
        : "エンコード中…";
      const encoded = await requestLocalEncode(
        payload,
        requestedFormat,
        requestedTargetBytes,
        requestedPriority,
      );
      encodedMetadata = encoded.metadata;
      blob = encoded.blob;
      filename = `${safeName}.${requestedFormat}`;
    } else if (requestedFormat === "apng") {
      const bytes = await makeApng(state, timings);
      blob = new Blob([bytes], { type: "image/png" });
      filename = `${safeName}.png`;
    } else if (["ccfset-apng", "ccfset-webp"].includes(requestedFormat)) {
      const setOpacity = ccfSetOpacity();
      const fixedOpaque = state.forceOpaque || ["split", "stripe"].includes(state.kind);
      const outDuration =
        opacityMode.value === "roundtrip" ? state.enterMs : state.durationMs;
      const inDuration =
        opacityMode.value === "roundtrip" ? state.exitMs : state.durationMs;
      const outState = {
        ...state,
        opacityMode: "cover",
        durationMs: outDuration,
        startOpacity: 0,
        endOpacity: setOpacity,
        forceOpaque: fixedOpaque,
        shapeOpacity: ccfSetShapeOpacity(state, setOpacity),
      };
      const inState = {
        ...state,
        opacityMode: "reveal",
        durationMs: inDuration,
        startOpacity: setOpacity,
        endOpacity: 0,
        forceOpaque: fixedOpaque,
        shapeOpacity: ccfSetShapeOpacity(state, setOpacity),
      };
      let outBytes;
      let inBytes;
      let animationExtension;
      if (requestedFormat === "ccfset-webp") {
        const outEncoded = await makeWebp(
          outState,
          frameTimesWithEndpoints(outDuration, fps, outState),
          0,
          0.45,
        );
        outBytes = outEncoded.bytes;
        const inEncoded = await makeWebp(
          inState,
          frameTimesWithEndpoints(inDuration, fps, inState),
          0.5,
          0.45,
        );
        inBytes = inEncoded.bytes;
        encodedMetadata = {
          width,
          height,
          fps,
          attempts: outEncoded.attempts + inEncoded.attempts,
          exceeded: outEncoded.exceeded || inEncoded.exceeded,
        };
        animationExtension = "webp";
      } else {
        outBytes = await makeApng(
          outState,
          frameTimesWithEndpoints(outDuration, fps, outState),
          0,
          0.45,
        );
        inBytes = await makeApng(
          inState,
          frameTimesWithEndpoints(inDuration, fps, inState),
          0.5,
          0.5,
        );
        animationExtension = "png";
      }
      const holdBytes = encodeSolidPng(state.color, setOpacity, 10, 10);
      const holdColor = String(state.color || "#000000")
        .replace(/^#/, "")
        .toUpperCase()
        .padStart(6, "0")
        .slice(-6);
      const holdOpacity = Math.round(setOpacity * 100);
      const holdName = requestedNameLanguage === "ja"
        ? `HOLD_${holdColor}_不透明度${holdOpacity}.png`
        : `HOLD_${holdColor}_opacity${holdOpacity}.png`;
      outputFiles = [
        {
          name: `${safeName}_01_out.${animationExtension}`,
          data: outBytes,
        },
        { name: holdName, data: holdBytes },
        { name: `${safeName}_03_in.${animationExtension}`, data: inBytes },
      ];
      blob = new Blob([encodeZip(outputFiles)], { type: "application/zip" });
      filename = `${safeName}_ccfolia_${animationExtension}_set.zip`;
    } else {
      const files = [];
      const safeTimings = await ensureEndpoints(state, timings, "PNG連番");
      for (let index = 0; index < safeTimings.length; index += 1) {
        renderTransitionFrame(
          context,
          width,
          height,
          safeTimings[index].timeMs,
          state,
        );
        const png = await encodePng(context.getImageData(0, 0, width, height));
        files.push({
          name: `${safeName}_${String(index + 1).padStart(4, "0")}_${safeTimings[index].delayMs}ms.png`,
          data: png,
        });
        exportProgress.value = (index + 1) / safeTimings.length;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      outputFiles = files;
      blob = new Blob([encodeZip(outputFiles)], { type: "application/zip" });
      filename = `${safeName}_png.zip`;
    }
    exportProgress.value = 1;
    lastExport = { blob, filename };
    const actualWidth = encodedMetadata?.width || width;
    const actualHeight = encodedMetadata?.height || height;
    const actualFps = encodedMetadata?.fps || fps;
    const optimizationSummary = encodedMetadata
      ? ` / ${encodedMetadata.attempts}回探索${encodedMetadata.exceeded ? " / 上限超過" : ""}`
      : "";
    const endpointSummary = endpointWarnings.length
      ? ` / ⚠ ${[...new Set(endpointWarnings)].join("、")}`
      : " / 端点保証済み";
    const directFiles = outputFiles || [{ name: filename, data: blob }];
    if (requestedDestination === "folder") {
      const savedNames = await saveFilesToDirectory(directFiles);
      const totalBytes = directFiles.reduce(
        (sum, file) => sum + (file.data.size ?? file.data.byteLength ?? file.data.length ?? 0),
        0,
      );
      lastExport = null;
      inspectExport.disabled = true;
      exportResult.textContent = `${savedNames.length}ファイルを直接保存 / ${(totalBytes / 1024).toFixed(1)} KiB / ${actualWidth}×${actualHeight} / ${actualFps}fps / ${timings.length}基準フレーム${optimizationSummary}${endpointSummary}`;
      window.dispatchEvent(
        new CustomEvent("transition-export-complete", {
          detail: { filenames: savedNames, directory: exportDirectoryHandle.name },
        }),
      );
    } else {
      exportResult.textContent = `${filename} / ${(blob.size / 1024).toFixed(1)} KiB / ${actualWidth}×${actualHeight} / ${actualFps}fps / ${timings.length}基準フレーム${optimizationSummary}${endpointSummary}`;
      inspectExport.disabled = !["apng", "webp"].includes(requestedFormat);
      downloadBlob(blob, filename);
      window.dispatchEvent(
        new CustomEvent("transition-export-complete", {
          detail: { filename, blob },
        }),
      );
    }
  } catch (error) {
    exportResult.textContent = `書き出し失敗：${error.message}`;
  } finally {
    exportButton.disabled = false;
    exportFormat.disabled = false;
    exportDestination.disabled = false;
    updateExportControls();
  }
});

const inspectFile = document.querySelector("#inspectFile");
const inspectDropZone = document.querySelector("#inspectDropZone");
const fileInfo = document.querySelector("#fileInfo");
const inspectorCanvas = document.querySelector("#inspectorCanvas");
const inspectorContext = inspectorCanvas.getContext("2d");
const inspectionResults = document.querySelector("#inspectionResults");
const inspectPosition = document.querySelector("#inspectPosition");
const frameTimeline = document.querySelector("#frameTimeline");
const saveTrimmed = document.querySelector("#saveTrimmed");
const saveTrimmedWebp = document.querySelector("#saveTrimmedWebp");
const inspectPlayButton = document.querySelector("#inspectPlay");
const inspectLoop = document.querySelector("#inspectLoop");
let inspectedAnimation = null;
let inspectedAnalysis = null;
let inspectedIndex = 0;
let inspectTimer = 0;

function pauseInspectorPlayback() {
  if (!inspectTimer) return;
  clearTimeout(inspectTimer);
  inspectTimer = 0;
  inspectPlayButton.textContent = "再生";
}

function showInspectedFrame(index) {
  if (!inspectedAnimation?.frames.length) return;
  inspectedIndex = Math.max(
    0,
    Math.min(inspectedAnimation.frames.length - 1, index),
  );
  const frame = inspectedAnimation.frames[inspectedIndex];
  inspectorCanvas.width = inspectedAnimation.width;
  inspectorCanvas.height = inspectedAnimation.height;
  inspectorContext.putImageData(frame.imageData, 0, 0);
  inspectPosition.textContent = `${inspectedIndex + 1} / ${inspectedAnimation.frames.length} — ${frame.delayMs}ms`;
  [...frameTimeline.children].forEach((button, buttonIndex) =>
    button.classList.toggle("active", buttonIndex === inspectedIndex),
  );
}

function renderInspection() {
  inspectedAnalysis = analyzeFrames(inspectedAnimation);
  const safe = inspectedAnalysis.safeRun;
  inspectionResults.innerHTML = `
    ${inspectedAnimation.decodeMode === "static-fallback" ? '<li class="unsafe">このブラウザでは静止画1枚として読み込みました。アニメーション全体・Safe Cutの検査はできません。</li>' : ""}
    <li>サイズ：${inspectedAnimation.width}×${inspectedAnimation.height}</li>
    <li>フレーム：${inspectedAnimation.frames.length} / ${inspectedAnalysis.durationMs}ms</li>
    <li>フレームレート：平均 ${inspectedAnalysis.averageFps.toFixed(2)}fps（${inspectedAnalysis.variableFrameTiming ? `可変・${inspectedAnalysis.minimumDelayMs}–${inspectedAnalysis.maximumDelayMs}ms/フレーム` : `一定・約${Math.round(1000 / Math.max(1, inspectedAnalysis.minimumDelayMs))}fps` }）</li>
    <li>先頭完全透明：${inspectedAnalysis.leadingTransparent}フレーム／${inspectedAnalysis.leadingTransparentMs}ms</li>
    <li>末尾完全透明：${inspectedAnalysis.trailingTransparent}フレーム／${inspectedAnalysis.trailingTransparentMs}ms</li>
    <li>${safe ? `Safe Cut：${safe.startMs}–${safe.endMs}ms／推奨 ${inspectedAnalysis.recommendedCutMs}ms（frame ${inspectedAnalysis.recommendedFrame}）` : "完全被覆区間なし"}</li>`;
  frameTimeline.replaceChildren(
    ...inspectedAnalysis.details.map((detail) => {
      const button = document.createElement("button");
      button.textContent = String(detail.index + 1).padStart(3, "0");
      button.title = `透明 ${(detail.transparentRatio * 100).toFixed(1)}% / 不透明 ${(detail.opaqueRatio * 100).toFixed(1)}% / ${detail.delayMs}ms`;
      if (detail.fullyTransparent) button.dataset.state = "transparent";
      if (detail.fullyCovered) button.dataset.state = "covered";
      if (detail.index + 1 === inspectedAnalysis.recommendedFrame) {
        button.classList.add("transition-point");
        button.title += ` / TP ${inspectedAnalysis.recommendedCutMs}ms`;
      }
      button.addEventListener("click", () => showInspectedFrame(detail.index));
      return button;
    }),
  );
  saveTrimmed.disabled = false;
  saveTrimmedWebp.disabled = false;
  showInspectedFrame(
    Math.min(inspectedIndex, inspectedAnimation.frames.length - 1),
  );
}

async function inspectBlob(blob, name) {
  clearTimeout(inspectTimer);
  inspectTimer = 0;
  inspectPlayButton.textContent = "再生";
  fileInfo.textContent = `${name} / ${(blob.size / 1024).toFixed(1)} KiB — 読み込み中`;
  try {
    inspectedAnimation = await decodeAnimation(blob);
    inspectedIndex = 0;
    fileInfo.textContent = `${name} / ${(blob.size / 1024).toFixed(1)} KiB / ${blob.type || "type unknown"}${inspectedAnimation.decodeMode === "static-fallback" ? " / 静止画フォールバック" : ""}`;
    renderInspection();
  } catch (error) {
    inspectedAnimation = null;
    fileInfo.textContent = `読み込み失敗：${error.message}`;
  }
}

inspectFile.addEventListener("change", () => {
  const file = inspectFile.files?.[0];
  if (file) {
    const inferredType =
      file.type ||
      (file.name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png");
    inspectBlob(
      file.type ? file : new Blob([file], { type: inferredType }),
      file.name,
    );
  }
});
["dragenter", "dragover"].forEach((type) =>
  inspectDropZone.addEventListener(type, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    inspectDropZone.classList.add("is-dragging");
  }),
);
["dragleave", "dragend"].forEach((type) =>
  inspectDropZone.addEventListener(type, () =>
    inspectDropZone.classList.remove("is-dragging"),
  ),
);
inspectDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  inspectDropZone.classList.remove("is-dragging");
  const file = [...(event.dataTransfer?.files || [])].find(
    (item) =>
      /\.(webp|png|apng)$/i.test(item.name) ||
      ["image/webp", "image/png", "image/apng"].includes(item.type),
  );
  if (!file) {
    fileInfo.textContent = "Animated WebPまたはAPNG/PNGをドロップしてください";
    return;
  }
  const inferredType =
    file.type ||
    (file.name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png");
  inspectBlob(
    file.type ? file : new Blob([file], { type: inferredType }),
    file.name,
  );
});
inspectExport.addEventListener("click", () => {
  if (!lastExport) return;
  tabs.find((tab) => tab.dataset.view === "inspect").click();
  inspectBlob(lastExport.blob, lastExport.filename);
});

document
  .querySelector("#inspectFirst")
  .addEventListener("click", () => showInspectedFrame(0));
document
  .querySelector("#inspectPrev")
  .addEventListener("click", () => showInspectedFrame(inspectedIndex - 1));
document
  .querySelector("#inspectNext")
  .addEventListener("click", () => showInspectedFrame(inspectedIndex + 1));
document
  .querySelector("#inspectLast")
  .addEventListener("click", () =>
    showInspectedFrame((inspectedAnimation?.frames.length || 1) - 1),
  );
document.addEventListener("keydown", (event) => {
  if (
    !document.querySelector("#inspect").classList.contains("active") ||
    !inspectedAnimation?.frames.length ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) return;
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable
  ) return;
  const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
  if (!step) return;
  event.preventDefault();
  pauseInspectorPlayback();
  showInspectedFrame(inspectedIndex + step);
});
inspectPlayButton.addEventListener("click", function play() {
  if (!inspectedAnimation?.frames.length) return;
  if (inspectTimer) {
    clearTimeout(inspectTimer);
    inspectTimer = 0;
    this.textContent = "再生";
    return;
  }
  if (
    !inspectLoop.checked &&
    inspectedIndex >= inspectedAnimation.frames.length - 1
  )
    showInspectedFrame(0);
  this.textContent = "停止";
  const advance = () => {
    if (
      inspectedIndex >= inspectedAnimation.frames.length - 1 &&
      !inspectLoop.checked
    ) {
      inspectTimer = 0;
      inspectPlayButton.textContent = "再生";
      return;
    }
    showInspectedFrame((inspectedIndex + 1) % inspectedAnimation.frames.length);
    inspectTimer = setTimeout(
      advance,
      inspectedAnimation.frames[inspectedIndex].delayMs,
    );
  };
  inspectTimer = setTimeout(
    advance,
    inspectedAnimation.frames[inspectedIndex].delayMs,
  );
});
document
  .querySelector("#inspectBackground")
  .addEventListener("input", (event) => {
    document.querySelector(".inspector-stage").dataset.background =
      event.target.value;
  });
document.querySelector("#trimLeading").addEventListener("click", () => {
  if (!inspectedAnimation || !inspectedAnalysis.leadingTransparent) return;
  inspectedAnimation.frames.splice(
    0,
    Math.min(
      inspectedAnalysis.leadingTransparent,
      inspectedAnimation.frames.length - 1,
    ),
  );
  inspectedIndex = 0;
  renderInspection();
});
document.querySelector("#trimTrailing").addEventListener("click", () => {
  if (!inspectedAnimation || !inspectedAnalysis.trailingTransparent) return;
  const removeCount = Math.min(
    inspectedAnalysis.trailingTransparent,
    inspectedAnimation.frames.length - 1,
  );
  inspectedAnimation.frames.splice(
    inspectedAnimation.frames.length - removeCount,
    removeCount,
  );
  inspectedIndex = Math.min(
    inspectedIndex,
    inspectedAnimation.frames.length - 1,
  );
  renderInspection();
});
saveTrimmed.addEventListener("click", async () => {
  if (!inspectedAnimation) return;
  saveTrimmed.disabled = true;
  try {
    const bytes = await encodeApng(
      inspectedAnimation.frames,
      inspectedAnimation.width,
      inspectedAnimation.height,
      inspectedAnimation.loops ?? 1,
    );
    downloadBlob(
      new Blob([bytes], { type: "image/png" }),
      "trimmed-transition.png",
    );
  } finally {
    saveTrimmed.disabled = false;
  }
});
saveTrimmedWebp.addEventListener("click", async () => {
  if (!inspectedAnimation) return;
  saveTrimmedWebp.disabled = true;
  try {
    const encoded = await encodeAnimatedWebpToTarget(
      () => inspectedAnimation.frames,
      inspectedAnimation.width,
      inspectedAnimation.height,
      { loops: inspectedAnimation.loops ?? 1 },
    );
    downloadBlob(new Blob([encoded.bytes], { type: "image/webp" }), "trimmed-transition.webp");
  } finally {
    saveTrimmedWebp.disabled = false;
  }
});

const presetFields = [
  "kind",
  "color",
  "duration",
  "easing",
  "opacityMode",
  "adjustOpacity",
  "startOpacity",
  "endOpacity",
  "forceOpaque",
  "enterDuration",
  "holdDuration",
  "exitDuration",
  "matchExitDuration",
  "advancedTimeline",
  "timelineStartOpacity",
  "timelineCoverOpacity",
  "timelineEndOpacity",
  "matchTimelineEndOpacity",
  "customExitEasing",
  "exitEasing",
  "exitStyle",
  "count",
  "stripeStagger",
  "stripeStaggerPattern",
  "direction",
  "wipeAngle",
  "irisDirection",
  "irisTiming",
  "multiIrisLayers",
  "multiIrisStagger",
  "multiIrisColor1",
  "multiIrisColor2",
  "multiIrisColor3",
  "edgeFeather",
  "zoomDirection",
  "tileDirection",
  "blinkPattern",
  "blinkBalance",
  "blinkFeather",
  "radialStart",
  "radialDirection",
  "fogScale",
  "fogDensity",
  "fogTurbulence",
  "fogFeather",
  "fogDrift",
  "fogSeed",
];
document.querySelector("#savePreset").addEventListener("click", () => {
  const values = Object.fromEntries(
    presetFields.map((id) => {
      const element = document.querySelector(`#${id}`);
      return [
        id,
        element.type === "checkbox" ? element.checked : element.value,
      ];
    }),
  );
  downloadBlob(
    new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            app: "Transition Studio",
            values,
            easingPoints,
            exitEasingPoints,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    "transition-preset.json",
  );
});
document
  .querySelector("#loadPreset")
  .addEventListener("change", async (event) => {
    try {
      const parsed = JSON.parse(await event.target.files[0].text());
      if (parsed.schemaVersion !== 1 || !parsed.values)
        throw new Error("対応していない設定形式です");
      for (const [id, value] of Object.entries(parsed.values)) {
        const element = document.querySelector(`#${id}`);
        if (!element) continue;
        if (element.type === "checkbox") element.checked = Boolean(value);
        else element.value = value;
      }
      blinkFeatherSlider.value = blinkFeather.value;
      edgeFeatherSlider.value = edgeFeather.value;
      stripeStaggerSlider.value = stripeStagger.value;
      easingPoints.splice(
        0,
        4,
        ...(Array.isArray(parsed.easingPoints)
          ? parsed.easingPoints
          : easingPresets[easing.value]),
      );
      exitEasingPoints.splice(
        0,
        4,
        ...(Array.isArray(parsed.exitEasingPoints)
          ? parsed.exitEasingPoints
          : easingPresets[exitEasing.value]),
      );
      renderEasingGraph();
      renderExitEasingGraph();
      replay();
    } catch (error) {
      alert(`設定を読み込めません：${error.message}`);
    }
  });
