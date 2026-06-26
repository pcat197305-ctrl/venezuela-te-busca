/**
 * Venezuela Te Busca - API 数据采集脚本
 * 使用网站后端 API 直接获取所有数据
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://venezuelatebusca.com/api/persons';
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'api_all_persons.json');
const DATA_FILE = path.join(__dirname, '..', 'js', 'data.js');

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

async function fetchAll() {
  console.log('===========================================');
  console.log('Venezuela Te Busca - API 数据采集');
  console.log('===========================================\n');

  const allPersons = [];
  let url = API_URL;
  let page = 1;
  const startTime = Date.now();

  while (url) {
    process.stdout.write(`Fetching page ${page}... `);
    const result = await fetch(url);
    allPersons.push(...result.data.persons);
    console.log(`+${result.data.persons.length} (总计: ${allPersons.length})`);

    url = result.nextUrl;
    page++;

    // Safety limit
    if (page > 1000) {
      console.log('达到最大页数限制');
      break;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n采集完成! 用时: ${elapsed}s`);

  // 统计
  const missing = allPersons.filter(p => p.status === 'missing').length;
  const found = allPersons.filter(p => p.status === 'found').length;
  console.log(`总记录: ${allPersons.length.toLocaleString()}`);
  console.log(`  寻找中: ${missing.toLocaleString()}`);
  console.log(`  已找到: ${found.toLocaleString()}`);

  // 保存原始 API 数据
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    total: allPersons.length,
    data: allPersons,
    fetched_at: new Date().toISOString()
  }, null, 2));
  console.log(`\n原始数据已保存: ${OUTPUT_FILE}`);

  return allPersons;
}

async function convertAndSave(allPersons) {
  console.log('\n--- 转换数据格式 ---');

  // 加载现有 GPS 数据
  let existingGpsMap = {};
  try {
    const existingData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'geocoded_full_data.json'), 'utf8');
    existingData.data.forEach(item => {
      if (item.gps) {
        existingGpsMap[(item.name || '').toLowerCase().trim()] = item.gps;
      }
    });
    console.log(`加载了 ${Object.keys(existingGpsMap).length} 个 GPS 坐标`);
  } catch (e) {
    console.log('没有找到现有 GPS 数据');
  }

  // 转换格式
  const converted = allPersons.map(person => {
    const firstName = person.first_name || '';
    const lastName = person.last_name || '';
    const name = (firstName + ' ' + lastName).trim();

    let gps = existingGpsMap[name.toLowerCase().trim()] || null;

    let gender = '';
    if (person.gender === 'masculino') gender = 'Masculino';
    else if (person.gender === 'femenino') gender = 'Femenino';

    const location = person.last_seen_location || '';
    const age = person.age ? person.age + ' años' : '';

    return {
      name: name,
      location: age ? age + ' - ' + location : location,
      gender: gender,
      status: person.status === 'found' ? 'encontrado' : 'desaparecido',
      gps: gps,
      photo_key: person.photo_key,
      id: person.id
    };
  });

  // 按名字排序
  converted.sort((a, b) => a.name.localeCompare(b.name));

  // 保存
  fs.writeFileSync(DATA_FILE, 'var missingPersonsData = ' + JSON.stringify(converted) + ';');

  console.log('\n=== 最终数据统计 ===');
  console.log(`总记录: ${converted.length.toLocaleString()}`);
  console.log(`有 GPS: ${converted.filter(i => i.gps).length.toLocaleString()}`);
  console.log(`无 GPS: ${converted.filter(i => !i.gps).length.toLocaleString()}`);
  console.log(`寻找中: ${converted.filter(i => i.status === 'desaparecido').length.toLocaleString()}`);
  console.log(`已找到: ${converted.filter(i => i.status === 'encontrado').length.toLocaleString()}`);
  console.log(`\n已保存: ${DATA_FILE}`);
}

async function main() {
  try {
    const allPersons = await fetchAll();
    await convertAndSave(allPersons);

    console.log('\n===========================================');
    console.log('完成! 提交代码到 GitHub 以更新网站。');
    console.log('===========================================');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
