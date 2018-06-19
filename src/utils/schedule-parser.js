const cheerio = require('cheerio');
const moment = require('moment');
const mongoose = require('mongoose');

const { dayOfWeek, times } = require('../constants');
const { isBlank, trimmer, trimmers } = require('../helpers');

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
};

const roomItemParser = (val, duration) => {
  let group = '';
  let tutor = '';
  let name = '';

  const res = trimmers(val);

  if (val.length === 1) {
    if (duration === 15) { //  the whole day
      [name] = res;
    } else {
      [tutor] = res;
    }
  } else if (val.length === 2) {
    [group, name] = res;
  } else if (val.length === 3) {
    [group, tutor, name] = res;
  }

  if (name === 'INFSLC04-1') {
    console.log(name);
  }


  return {
    _id: mongoose.Types.ObjectId(),
    group: group.replace('.', ''),
    name,
    tutor,
  };
};

const groupItemParser = (val, duration) => {
  let room = [];
  let tutor = '';
  let name = '';
  let description = '';
  let idk = '';

  const res = trimmers(val);

  if (res.length === 1 && duration === 15) {
    [name] = res;
  } else if (res.length === 5) {
    [tutor, room, name, idk, description] = res;
  }

  return {
    _id: mongoose.Types.ObjectId(),
    tutor,
    room,
    name,
    description,
  };
};

const tutorItemParser = (val, duration) => {
  let room = [];
  let group = '';
  let name = '';
  let description = '';
  let idk = '';

  const res = trimmers(val);

  if (res.length === 1) {
    [name] = res;
  } else if (res.length === 3) {
    [name, room] = res;
  } else {
    [name, group, room, idk] = res;
  }

  return {
    _id: mongoose.Types.ObjectId(),
    group,
    room,
    name,
    description,
  };
};

const extractScheduleItem = elem => cheerio(elem.find('tbody')[0]);
const ExtractScheduleItemElements = elem =>
  elem.children()
    .map((i, item) =>
      cheerio(item).children()).get().map(c => c.text());

const scheduleItemParser = (dayColumn, type, duration) => {
  const scheduleItem = extractScheduleItem(dayColumn);
  const scheduleItemElements = ExtractScheduleItemElements(scheduleItem);

  if (type === 'r') {
    return roomItemParser(scheduleItemElements, duration);
  } else if (type === 'c') {
    return groupItemParser(scheduleItemElements, duration);
  }
  return tutorItemParser(scheduleItemElements, duration);
};

const children = $ => cheerio($).children();

// const extractTime = dayColumn => cheerio(dayColumn.find('td')[1]).text().match('[a-zA-Z0-9:-]+')[0];

const extractScheduleName = $ => $($('font')[2]).text().trim();

const extractRows = $ => $($('table').find('tbody')[0]).children();

const extractScheduleBlockRows = trRows => cheerio(trRows.slice(1));

const extractHourMinute = time => time.split('-')[0].split(':');

const extractDuration = dayColumn => dayColumn[0].attribs.rowspan / 2;

const scheduleParser = $ => (type, week) => {
  const entityName = extractScheduleName($);
  const trRows = extractRows($);
  const scheduleBlockRows = extractScheduleBlockRows(trRows);
  const lectures = [];

  let special = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };


  scheduleBlockRows.each((blockCount, blockRow) => {
    // Check if it's a empty row
    const blocks = children(blockRow);
    if (blocks.length > 0) {
      Object.keys(special).forEach((key) => {
        if (special[key] > 0) {
          special[key] -= 1;
        }
      });
      // Time out of the time block
      let time;
      let dayAdder = 0;

      blocks.each((dayN, _dayColumn) => {
        const dayColumn = $(_dayColumn);

        const dayText = dayColumn.text();
        if (dayN > 0) {
          if (!isBlank(dayColumn.text())) {
            while (special[dayN + dayAdder] > 0) {
              dayAdder += 1;
            }
          }

          dayN += dayAdder;

          time = times[blockCount === 0 ? 0 : blockCount / 2];

          if (!isBlank(dayColumn.text())) {
            const startWeek = moment(week.text, 'DD-MM-YYYY');
            const day = startWeek.add(dayN - 1, 'd');
            const [hour, minute] = extractHourMinute(time);
            const start = day.set({ hour, minute: Number(minute) }).toDate();
            const duration = extractDuration(dayColumn);
            special[dayN] = duration;
            const startBlock = blockCount > 0 ? (blockCount + 2) / 2 : blockCount;
            const [endHour, endMinute] = times[((startBlock > 0 ? startBlock : 1) + duration) - 2].split('-')[1].split(':');
            const end = day.set({ hour: endHour, minute: Number(endMinute) }).toDate();
            lectures.push({
              ...scheduleItemParser(dayColumn, type, duration),
              date: { start, end },
            });
          }
        }
      });
    }
  });

  return { name: entityName, booked: lectures.filter(i => i.tutor !== '-3') };
};

module.exports = scheduleParser;
