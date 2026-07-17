interface PublicBottomNavProps {
  onRandom: () => void;
  onAdvanced: () => void;
}

export function PublicBottomNav({ onRandom, onAdvanced }: PublicBottomNavProps) {
  return (
    <nav className="public-bottom-nav" aria-label="移动端快捷导航">
      <button type="button" className="active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span aria-hidden="true">⌂</span><b>首页</b></button>
      <button type="button" onClick={onRandom}><span aria-hidden="true">↝</span><b>随机</b></button>
      <button type="button" onClick={onAdvanced}><span aria-hidden="true">≡</span><b>筛选</b></button>
    </nav>
  );
}
