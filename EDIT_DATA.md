# 手动维护 DDL 和常用网站

网站入口仍是仓库根目录的 `index.html`；它会打开 `main/main.html`。首次发布拆分版时，请把 `index.html`、`main`、`class`、`DDL`、`website` 一起放到仓库的 `main` 分支根目录，保留文件夹名称和层级。

## 添加跨设备 DDL

打开 `DDL/data.js`，在 `manualAssignments = [` 与 `];` 之间添加一项：

```js
{
  course: "高等量子力学",
  deadline: "2026-10-25 18:00",
  content: `完成第一章习题
第 1～5 题`,
  address: "https://example.com/submit",
},
```

- 截止时间按北京时间填写，必须是 `YYYY-MM-DD HH:MM`。
- `address` 可以是提交网址、线下地点，也可以是 `""`。
- `content` 用反引号包住时可以直接换行，网页会按原来的换行显示。
- 多项作业直接接着写；每项最后的逗号请保留。
- 保存并上传 `DDL/data.js` 后，所有设备会显示文件中的作业。

## 添加跨设备常用网站

打开 `website/data.js`，在 `manualWebsites = [` 与 `];` 之间添加一项：

```js
{
  name: "学校教务处",
  url: "https://example.com",
  note: "选课、成绩查询",
},
```

- 网址以 `https://` 或 `http://` 开头。
- `note` 可以是 `""`。
- 保存并上传 `website/data.js` 后，所有设备会显示文件中的网站。

网页上的“添加作业”和“新增网址”按钮仍能使用，但按钮添加的条目只保存在当前浏览器。原来通过按钮添加的内容会继续留在原浏览器，不会自动写入数据文件；若希望跨设备看到，请照着原内容手动写入对应的 `data.js` 并上传。文件中的条目需要在文件里修改或删除。

如果仓库是公开的，别人也能直接查看这些 `data.js` 文件；请勿把密码等私密内容写进去。

课表宽度与每节小框高度可以在 `class/class.css` 最上方修改。修改任何文件后，都要把它上传到 GitHub 仓库，线上网页才会更新。

如果要在电脑上预览，先在仓库文件夹运行 `python -m http.server 8767`，然后打开 `http://localhost:8767/`。拆分版使用模块文件，直接双击本地 HTML 可能无法加载。
