const cheerio = require('cheerio');

const isBlank = (str) => {
  return (!str || /^\s*$/.test(str));
}

const getScheduleName = ($) => {
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
    const tutor = trimmer(arr[0]);
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
      duration: (lectureStart, lectureDuration, lectureStart + lectureDuration),
      tutor,
      rooms,
      subjectCode,
      subjectTitle
    }
    return lecture;
  }
}



const scheduleParser = (response) => {
  const $ = cheerio.load(response);
  const entityName = getScheduleName($);
  const trRows = $($('table').find('tbody')[0]).children();

  const tdDaysOfWeek = $(trRows.slice(0, 1)).children()
  const trRestRows = $(trRows.slice(1));
  // const dayOfWeek = [];
  const lectures = [];
  const times = [];

  // tdDaysOfWeek.each((i, day) => {
  //   if (i > 0) {
  //     dayOfWeek.push($(day).text().match('[a-zA-Z0-9:-]+')[0]);
  //   }
  // });

  trRestRows.each((trCount, timeRow) => {
    if ($(timeRow).children().length > 0) {
      let time;
      $(timeRow).children().each((tdCount, _dayColumn) => {
        const dayColumn = $(_dayColumn);
        if (tdCount === 0) {
          time = $(dayColumn.find('td')[1]).text().match('[a-zA-Z0-9:-]+')[0];
          times.push(time)
        } else {
          const lec = dayColumn.text();
          const lectureDuration = dayColumn[0].attribs.rowspan / 2;
          if (!isBlank(lec)) {
            const lectureBody = $(dayColumn.find('tbody')[0]);
            const arr = lectureBody.children().map((i, item) => $(item).children()).get().map(c => c.text());
            const lecture = parseLecture(arr, time, lectureDuration, trCount, tdCount);
            if (lecture) {
              lectures.push(lecture)
            }
          }
        }
      });
    }
  });

  return { name: entityName, lectures };
}

module.exports = scheduleParser;