interface PublicBottomNavProps {
  favoritesOnly: boolean;
  favoriteCount: number;
  onShowAll: () => void;
  onShowFavorites: () => void;
  onRandom: () => void;
  onAdvanced: () => void;
}

export function PublicBottomNav({ favoritesOnly, favoriteCount, onShowAll, onShowFavorites, onRandom, onAdvanced }: PublicBottomNavProps) {
  return (
    <nav className="public-bottom-nav" aria-label="移动端快捷导航">
      <button type="button" className={!favoritesOnly ? "active" : ""} onClick={onShowAll}><span aria-hidden="true">⌂</span><b>首页</b></button>
      <button type="button" className={favoritesOnly ? "active" : ""} onClick={onShowFavorites}><span aria-hidden="true">♡</span><b>收藏{favoriteCount ? ` ${favoriteCount}` : ""}</b></button>
      <button type="button" onClick={onRandom}><span aria-hidden="true">↝</span><b>随机</b></button>
      <button type="button" onClick={onAdvanced}><span aria-hidden="true">≡</span><b>筛选</b></button>
    </nav>
  );
}
