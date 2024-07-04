// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const axios = require('axios');

const CARGO_MODE: vscode.DocumentSelector = { language: 'toml', pattern: '**/Cargo.toml', scheme: 'file' };
const CRATES_IO_SEARCH_URL = 'https://crates.io/api/v1/crates?page=1&per_page=10&q=';
const CRATES_IO_CRATE_URL = (crate: string) => `https://crates.io/api/v1/crates/${crate}`;


interface Crate {
	name: string,
	// eslint-disable-next-line @typescript-eslint/naming-convention
	max_stable_version: string,
	description: string,
}
interface CrateVersion {
	num: string,
	yanked: boolean,
}
interface ProxyConf {
	host: string,
	port: number,
}

function isInDependencies(document: vscode.TextDocument, cursorLine: number): boolean {
	let regex = /^\s*\[(.+)\]/ig;
	let line = cursorLine - 1;
	let isInDependencies = false;
	while (line > 0) {
		let attr = regex.exec(document.lineAt(line).text);
		if (attr) {
			isInDependencies = attr[1].includes('dependencies');
			break;
		}
		line--;
	}
	return isInDependencies;
}
function getTextBeforeCursor(document: vscode.TextDocument, position: vscode.Position): string {
	const range = new vscode.Range(position.line, 0, position.line, position.character);
	return document.getText(range);
}

class CrateNameCompletionItemProvider implements vscode.CompletionItemProvider {

	public async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.CompletionList> {
		try {

			console.log('provideCompletionItems%%%%%%%%%%');

			// const outputChannel = vscode.window.createOutputChannel('ccd');
			// this.outputChannel.appendLine('dddddddddddaaaa activated');

			if (!isInDependencies(document, position.line)) {
				return new vscode.CompletionList();
			}

			const text = getTextBeforeCursor(document, position);

			if (text.includes('=')) {
				return new vscode.CompletionList();
			}

			const res = await axios.get(`${CRATES_IO_SEARCH_URL}${text}`, {
				proxy: false
			});

			// let res;
			// if (this.proxy) {
			// 	const proxyConfig = this.proxy;
			// 	res = await axios.get(`${CRATES_IO_SEARCH_URL}${text}`, { proxyConfig });
			// } else {
			// 	res = await axios.get(`${CRATES_IO_SEARCH_URL}${text}`);
			// }

			const { crates }: { crates: Crate[] } = res.data;
			const items = crates.map(crate => {
				const item = new vscode.CompletionItem(crate.name, vscode.CompletionItemKind.Property);
				item.insertText = new vscode.SnippetString(`${crate.name} = "${crate.max_stable_version}"\${0}`);

				item.detail = `latest: ${crate.max_stable_version}`;
				item.documentation = `${crate.description}`;
				const startPos = new vscode.Position(position.line, 0);
				const endPos = new vscode.Position(position.line, position.character);
				item.range = new vscode.Range(startPos, endPos);
				return item;
			});
			return new vscode.CompletionList(items, true);
		} catch (error) {
			console.log(error);
			return new vscode.CompletionList();
		}
	}
}
class CrateVersionCompletionItemProvider implements vscode.CompletionItemProvider {

	public async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.CompletionList> {
		try {
			console.log('CrateVersionCompletionItemProvider');
			if (!isInDependencies(document, position.line)) {
				console.log('not isInDependencies');
				return new vscode.CompletionList();
			}

			const text = getTextBeforeCursor(document, position);

			if (!text.includes('=')) {
				console.log('not includes =');
				return new vscode.CompletionList();
			}

			const getCrate = /^\s*([\w-]+?)\s*=/;
			const isSimple = /^\s*([\w-]+?)\s*=\s*"[^"]*$/;
			const isInlineTable = /version\s*=\s*"[^"]*$/;

			if (!(getCrate.test(text) && (isSimple.test(text) || isInlineTable.test(text)))) {
				return new vscode.CompletionList();
			}

			console.log(text);
			const crate = (getCrate.exec(text) as RegExpExecArray)[1];

			const url = `https://crates.io/api/v1/crates/${crate}`;
			const res = await axios.get(url, {
				proxy: false
			});
			const { crate: crateMeta, versions }: { crate: Crate, versions: CrateVersion[] } = await res.data;

			const items = versions
				.filter(version => !version.yanked)
				.map(version => version.num)
				.map((version, i) => {
					const item = new vscode.CompletionItem(version, vscode.CompletionItemKind.Constant);
					item.insertText = new vscode.SnippetString(`${version}`);
					item.sortText = i.toLocaleString('en-US', {
						minimumIntegerDigits: 10,
						useGrouping: false,
					});
					if (version === crateMeta.max_stable_version) {
						item.detail = `latest`;
						item.preselect = true;
					}
					const startPos = new vscode.Position(position.line, text.lastIndexOf('"') + 1);
					const endPos = new vscode.Position(position.line, position.character);
					item.range = new vscode.Range(startPos, endPos);
					return item;
				});

			return new vscode.CompletionList(items, false);
		} catch (error) {
			console.log(error);
			return new vscode.CompletionList();
		}

	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "crate-helper" is now active!');

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
		CARGO_MODE,
		new CrateNameCompletionItemProvider(),
	));
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
		CARGO_MODE,
		new CrateVersionCompletionItemProvider(),
		'=', ' ', '"', '.', '~', '^', '>', '<', ...'0123456789'
	));
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Congratulations, your extension "crate-helper" is now deactive!');
}
