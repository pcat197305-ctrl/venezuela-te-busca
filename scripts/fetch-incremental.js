/**
 * Venezuela Te Busca - 增量采集模块
 * 基于 API 数据对比，仅采集新增或更新的记录
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://venezuelatebusca.com/api/persons';
const DATA_FILE = path.join(__dirname, '..', 'js', 'data.js');
const STATE_FILE = path.join(__dirname, '..', 'data', 'fetch_state.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const linkHeader = res.headers.link || '';
        const nextMatch = linkHeader.match(/<([^>]+)>; rel="next"/);
        const nextUrl = nextMatch ? nextMatch[1] : null;
        resolve({ data: JSON.parse(data), nextUrl });
      });
    }).on('error', reject);
  });
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return {
      last_fetch: null,
      records: {},      // { id: { name, status, updated_at, ... } }
      total_fetched: 0
    };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getRecordId(person) {
  return person.id;
}

function getRecordKey(person) {
  return `${person.first_name || ''}|${person.last_name || ''}|${person.last_seen_location || ''}`.toLowerCase().trim();
}

function normalizeRecord(person) {
  const firstName = person.first_name || '';
  const lastName = person.last_name || '';
  const name = (firstName + ' ' + lastName).trim();

  let gender = '';
  if (person.gender === 'masculino') gender = 'Masculino';
  else if (person.gender === 'femenino') gender = 'Femenino';

  const location = person.last_seen_location || '';
  const age = person.age ? person.age + ' años' : '';

  return {
    id: person.id,
    name: name,
    location: age ? age + ' - ' + location : location,
    gender: gender,
    status: person.status === 'found' ? 'encontrado' : 'desaparecido',
    photo_key: person.photo_key,
    // 保留原始数据用于比对
    _raw: {
      first_name: firstName,
      last_name: lastName,
      gender: person.gender,
      age: person.age,
      last_seen_location: location,
      status: person.status,
      updated_at: person.updated_at || person.created_at || null
    }
  };
}

function recordsEqual(a, b) {
  // 比较关键字段
  return (
    a.name === b.name &&
    a.location === b.location &&
    a.gender === b.gender &&
    a.status === b.status
  );
}

async function fetchAllApiData() {
  const allPersons = [];
  let url = API_URL;
  let page = 1;

  while (url) {
    process.stdout.write(`\rFetching page ${page}...`);
    const result = await fetch(url);
    allPersons.push(...result.data.persons);
    url = result.nextUrl;
    page++;

    if (page > 1000) {
      console.log('\n达到最大页数限制');
      break;
    }
  }
  console.log('\nAPI 返回总记录数:', allPersons.length);
  return allPersons;
}

async function incrementalFetch(options = {}) {
  const { skipGpsMatch = false } = options;
  console.log('===========================================');
  console.log('Venezuela Te Busca - 增量采集');
  console.log('===========================================\n');

  const state = loadState();
  const startTime = Date.now();
  const isFirstRun = state.last_fetch === null;

  // 1. 从 API 获取全部数据
  console.log('[1/4] 从 API 获取数据...');
  const apiPersons = await fetchAllApiData();

  // 2. 转换格式
  console.log('\n[2/4] 对比数据变化...');
  const newRecords = [];
  const updatedRecords = [];
  const unchangedCount = 0;

  // 加载现有 GPS 数据用于匹配
  let existingGpsMap = {};
  if (!skipGpsMatch) {
    try {
      const existingData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'geocoded_full_data.json'), 'utf8'));
      existingData.data.forEach(item => {
        if (item.gps) {
          existingGpsMap[(item.name || '').toLowerCase().trim()] = item.gps;
        }
      });
      console.log(`  加载了 ${Object.keys(existingGpsMap).length} 个 GPS 坐标`);
    } catch (e) {
      console.log('  没有找到现有 GPS 数据');
    }
  }

  const allRecords = {};
  const now = new Date().toISOString();

  for (const person of apiPersons) {
    const normalized = normalizeRecord(person);
    const id = normalized.id;
    const existing = state.records[id];

    // 匹配 GPS
    normalized.gps = existing?.gps || existingGpsMap[normalized.name.toLowerCase().trim()] || null;

    if (!existing) {
      // 新记录
      newRecords.push(normalized);
    } else {
      // 已有记录，检查是否有变化
      normalized.gps = existing.gps; // 保留已有 GPS
      if (!recordsEqual(normalized, existing)) {
        updatedRecords.push({ old: existing, new: normalized });
      }
    }

    allRecords[id] = normalized;
  }

  // 3. 输出变化摘要
  console.log('\n[3/4] 数据变化摘要:');
  console.log(`  API 总记录:  ${apiPersons.length}`);
  console.log(`  上次采集:   ${state.total_fetched || 0}`);
  console.log(`  ─────────────────────────`);
  console.log(`  🆕 新增:     ${newRecords.length}`);
  console.log(`  🔄 更新:     ${updatedRecords.length}`);
  console.log(`  ✓ 无变化:   ${apiPersons.length - newRecords.length - updatedRecords.length}`);

  if (isFirstRun) {
    console.log('\n  📝 首次运行，将更新全部数据');
  }

  // 显示变化详情
  if (updatedRecords.length > 0 && updatedRecords.length <= 20) {
    console.log('\n  更新详情:');
    for (const { old: o, new: n } of updatedRecords) {
      const changes = [];
      if (o.name !== n.name) changes.push(`名字: "${o.name}" → "${n.name}"`);
      if (o.status !== n.status) changes.push(`状态: ${o.status} → ${n.status}`);
      if (o.location !== n.location) changes.push(`地点: "${o.location}" → "${n.location}"`);
      console.log(`    - ${o.name}: ${changes.join(', ')}`);
    }
  } else if (updatedRecords.length > 20) {
    console.log('\n  前10个更新:');
    for (const { old: o, new: n } of updatedRecords.slice(0, 10)) {
      console.log(`    - ${o.name}: ${o.status !== n.status ? `状态 ${o.status} → ${n.status}` : '其他变化'}`);
    }
    console.log(`    ... 还有 ${updatedRecords.length - 10} 条`);
  }

  // 4. 保存结果
  console.log('\n[4/4] 保存数据...');

  // 合并所有记录（保留 GPS）
  const finalRecords = Object.values(allRecords);

  // 按名字排序
  finalRecords.sort((a, b) => a.name.localeCompare(b.name));

  // 写入 data.js
  fs.writeFileSync(DATA_FILE, 'var missingPersonsData = ' + JSON.stringify(finalRecords) + ';');

  // 更新状态文件
  const newState = {
    last_fetch: now,
    last_fetch_timestamp: Date.now(),
    total_fetched: apiPersons.length,
    records: {}
  };

  // 保存精简状态（用于比对）
  for (const record of finalRecords) {
    newState.records[record.id] = {
      name: record.name,
      location: record.location,
      gender: record.gender,
      status: record.status,
      gps: record.gps,
      updated_at: record._raw?.updated_at
    };
  }

  saveState(newState);

  // 统计
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const missing = finalRecords.filter(r => r.status === 'desaparecido').length;
  const found = finalRecords.filter(r => r.status === 'encontrado').length;
  const withGps = finalRecords.filter(r => r.gps).length;

  console.log('\n===========================================');
  console.log('采集完成! 用时:', elapsed + 's');
  console.log('===========================================');
  console.log('总记录:', finalRecords.length.toLocaleString());
  console.log('  寻找中:', missing.toLocaleString());
  console.log('  已找到:', found.toLocaleString());
  console.log('  有 GPS:', withGps.toLocaleString());
  console.log('  无 GPS:', (finalRecords.length - withGps).toLocaleString());
  console.log('\n已保存:');
  console.log('  -', DATA_FILE);
  console.log('  -', STATE_FILE);
  console.log('\n请提交代码到 GitHub 以更新网站。');
  console.log('===========================================');

  return {
    newRecords: newRecords.length,
    updatedRecords: updatedRecords.length,
    total: finalRecords.length,
    missing,
    found,
    withGps
  };
}

// 命令行运行
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    skipGpsMatch: args.includes('--no-gps')
  };

  incrementalFetch(options).catch(console.error);
}

module.exports = { incrementalFetch, loadState };
