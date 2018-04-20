const cheerio = require('cheerio');
const moment = require('moment');

const isBlank = (str) => {
  return (!str || /^\s*$/.test(str));
}

const getScheduleName = ($) => {
  if ($($('font')[1]).text().trim() === 'H.4.318') {
    console.log('------ ', $($('font')[1]).text().trim());
  }
  
  return $($('font')[2]).text().trim()
}

const trimmer = (text) => {
  return text.replace(/  /g, '').split(/[\n,]+/).slice(1, -1);
}

const dayOfWeek = [
  'Maandag',
  'Dinsdag',
  'Woensdag',
  'Donderdag',
  'Vrijdag',
];

const parseLecture = (arr, time, lectureDuration, lectureStart, day) => {
  if (arr.length > 1) {
    const tutors = trimmer(arr[0]);
    let rooms = [];
    let subjectCode = '';
    let subjectTitle = '';
    if (arr.length > 2) {
      rooms = trimmer(arr[1]);
      subjectCode = trimmer(arr[2])[0];
      subjectTitle = trimmer(arr[arr.length - 1])[0];
    }

    const lecture = {
      day: dayOfWeek[day],
      dayOfWeek: day,
      startTime: time.split('-')[0],
      endTime: '',
      duration: [lectureStart, lectureDuration, lectureStart + lectureDuration],
      tutor,
      rooms,
      subjectCode,
      subjectTitle
    }
    return lecture;
  }
}

const roomItemParser = (val) => {
  let _class = '';
  let tutor = '';
  let subjectCode = '';
  let bankHoliday = '';

  if (val.length === 1) {
    bankHoliday = trimmer(val[0])[0];
  } else if (val.length === 2) {
    _class = trimmer(val[0])[0];
    subjectCode = trimmer(val[1])[0];
  } else if (val.length === 3) {
    _class = trimmer(val[0])[0];
    tutor = trimmer(val[1])[0];
    subjectCode = trimmer(val[2])[0];
  }

  return {
    class: _class,
    subjectCode,
    bankHoliday,
    tutor
  };
}

const scheduleItemParser = (dayColumn, type) => {
  const $ = cheerio;
  const duration = dayColumn[0].attribs.rowspan / 2;
  const scheduleItem = $(dayColumn.find('tbody')[0]);
  const arr = scheduleItem.children().map((i, item) => $(item).children()).get().map(c => c.text());
  return {
    ...roomItemParser(arr), duration
  };
    // const lecture = parseLecture(arr, time, lectureDuration, trCount / 2, tdCount);
    // if (lecture) {
    //   lectures.push(lecture)
    // }
}

const children = ($) => cheerio($).children()
const extractTime = (dayColumn) => cheerio(dayColumn.find('td')[1]).text().match('[a-zA-Z0-9:-]+')[0];


const parseDate = (dateString) => {
  [day, month, year] = dateString.split('-');
  return new Date(year, month - 1, day, 0, 0, 0);
}

const addDays = (date, days) => {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const setTime = (date, time) => {
  [hours, minutes] = time.split(':');
  var result = new Date(date);

  result.setHours(hours, minutes)
  return result;
}

const scheduleParser = (response, type, week) => {
  const $ = cheerio.load(response);
  const entityName = getScheduleName($);
  const trRows = $($('table').find('tbody')[0]).children();

  const tdDaysOfWeek = $(trRows.slice(0, 1)).children()
  const scheduleBlockRows = $(trRows.slice(1));
  

  const lectures = [];
  const times = [];
  
  const startWeek = moment(week.text, 'DD-MM-YYYY');

  scheduleBlockRows.each((blockCount, blockRow) => {
    // Check if it's a empty row
    const blocks = children(blockRow);
    if (blocks.length > 0) {
      // Time out of the time block
      let time;
      blocks.each((dayN, _dayColumn) => {
        const dayColumn = $(_dayColumn);
        if (dayN === 0) {
          time = extractTime(dayColumn);
          times.push(time)
        } else {
          if (!isBlank(dayColumn.text())) {
            const startWeek = moment(week.text, 'DD-MM-YYYY');
            const day = startWeek.add(dayN - 1, 'd');
            console.log(day);
            console.log(dayN);
            [hour, minute] = time.split('-')[0].split(':');
            const start = day.set({ hour, minute: Number(minute) })
            
            lectures.push({
              ...scheduleItemParser(dayColumn, type),
              start: start.format(),
              end: '',
              startBlock: blockCount > 0 ? (blockCount + 2) / 2 : blockCount,
            });
          }
        }
      });
    }
  });

  const newLectures = lectures.map(lecture => {
    [hour, minute] = times[(lecture.startBlock > 0 ? lecture.startBlock : 1) + lecture.duration - 2].split('-')[1].split(':');
    lecture.end = moment(lecture.start).set({ hour, minute }).format()
    return lecture;
  });

  return { name: entityName, booked: newLectures };
}

module.exports = scheduleParser;