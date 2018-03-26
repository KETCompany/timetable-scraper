import json
import codecs
import re
from bs4 import BeautifulSoup

f=codecs.open("rooster.html", 'r', 'utf-8')
soup = BeautifulSoup(f.read(), 'html.parser')

table = soup.find('table')
tbody =  table.find('tbody')





isEmpty = lambda x: x != '\n'


def stripText(x): return re.search('[a-zA-Z0-9:-]+', x).group(0) if re.search('[a-zA-Z0-9:-]+', x) else False

dates = {}
daysInWeek = []

tr_rows = tbody.find_all('tr', recursive=False)

weekDaysRow = tr_rows.pop(0)

for td in filter(isEmpty, weekDaysRow.children):
    result = stripText(td.getText())
    if result:
        daysInWeek.append(result)
        dates[result] = []
    else:
        dates['times'] = []

lectures = []

for tr in tr_rows:
    td_rows = tr.find_all('td', recursive=False)
    if td_rows:
        timeRow = td_rows.pop(0)
        time = stripText(timeRow.find_all('td')[1].getText())
        if time:
            dates['times'].append(time)
        index = 0
        for lec in td_rows:
            match = re.split('[\\n]+', lec.getText().replace('  ', ''))
            match.pop(0)
            match.pop(-1)
            if match:
                lecture = {
                    'day': daysInWeek[index],
                    'startTime': time.split('-')[0],
                    'endTime': '',
                    'duration': (index, int(lec['rowspan'])/2, index + int(lec['rowspan'])/2),
                    'teacher': match[0],
                    'rooms': match[1].split(','),
                    'subjectCode': match[2],
                    'subjectTitle': match[-1],
                }
                lectures.append(lecture)
            index = index + 1


for lecture in lectures:
    lecture['endTime'] = dates['times'][lecture['duration'][2]].split('-')[1]
    dates[lecture['day']].append(lecture)


print json.dumps(dates, indent=4, sort_keys=True)
