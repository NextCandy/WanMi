export function PublicBottomNav() {
  return (
    <nav className="public-bottom-nav" aria-label="移动端快捷导航">
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span aria-hidden="true">⌂</span><b>首页</b></button>
      {/* 高级筛选面板已移除，「筛选」滚动到工具栏的分类/后缀/位数/排序下拉 */}
      <button type="button" onClick={() => document.querySelector(".catalogue-toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" })}><span aria-hidden="true">≡</span><b>筛选</b></button>
    </nav>
  );
}
