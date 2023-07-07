## Auto Hyperlink Plugin

This plugin inserts hyperlink into reading view of Obsidian documents according to user-defined rule.

### Basic Usage

In the plugin setting pane, you can define hyperlink rule in the form of JSON. Its key should be a pattern that matches the words that you want to insert hyperlink. Corresponding value is a template for URL to be inserted. For example, the following rule will detect every words of "Obsidian" and insert a link to `https://github.com/obsidianmd`, which is almost equivalent to write `[Obsidian](https://github.com/obsidianmd)` in editing mode. If your document contains many "Obsidian"'s, this plugin automatically inserts a link to all of them - no manual linking, no omission.

```
{
    "Obsidian": "github.com/obsidianmd"
}
```

If you omit `https://`, the plugin automatically prepend it. If you need to access the site with http (non-secure HTTP), the template have to start with `http://`.

### Advanced Usage: Regex and Placeholder

You can use regex (regular expression) for matching. Pattern string is given to [RegExp](https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/RegExp) to enable regex mathing. The following rule will detect all of "Obsidian" (capitalized) and "obsidian" (lower letter), insert a link to `https://obsidian.md`.

```
{
    "[oO]bsidian": "obsidian.md"
}
```

JSON value can be a _template_ rather than direct URL. You can embed matched string using **placeholder**. The above rule is equivalent to the following.

```
{
    "[oO]bsidian": "$0.md"
}
```

In the template, `$0` is a placeholder that is replaced by matched pattern. Resulting URL will be `obsidian.md` or `Obsidian.md` depending on the matched string is either capitalized or in lower letter case (it seems that the latter URL is redirected to the former). You can use placeholders for subpattern as `$` with positive integer like `$1`. The following example uses subpattern to insert a link to GitHub pull requests.

```
{
    "Obsidian PR (#[0-9]+)": "github.com/obsidianmd/obsidian-releases/pull/$1"
}
```

When the pattern matches "Obsidian PR #10", `$0` corresponds to whole matched string while `$1` is replaced with the first subpattern enclosed by parenthesis, which is `10` in this case. So, resulting URL will be `https://github.com/obsidianmd/obsidian-releases/pull/10`

### Multiple Rules

You can define multiple rules by separating them with comma. Be careful about the ordering of rules. If multiple rules exist, **upper rule take priority**. If you have the following two rules, "obsidian" (lower letter) will be linked to `https://obsidian.md` but "Obsidian" (capitalized) will be linked to `https://github.com/obsidianmd` because upper rule takes priority.

```
{
    "Obsidian": "github.com/obsidianmd",
    "[oO]bsidian": "$0.md"
}
```

### Author

[@take6](https://github.com/take6)


### TODO

- complete documentation
- create demo PDF using Obsidian with above rules
- license

