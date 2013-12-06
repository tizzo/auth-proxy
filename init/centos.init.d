#!/bin/sh
#
# auth-proxy        Startup script for the auth proxy.
#
# chkconfig: - 85 15
# description: A proxy with enforcing google authentication.
# processname: auth-proxy
# config: /opt/auth-proxy/config.json
# pidfile: /var/run/authentication-proxy.pid
#
PROXY_USER='auth-proxy'
PROXY_PID_FILE='/var/run/authentication-proxy.pid'
START_COMMAND='/opt/auth-proxy/bin/auth-proxy'
PROXY_LOG='/var/log/auth-proxy.log'

# Source function library.
. /etc/init.d/functions

case "$1" in
    start)
  echo -n "Starting auth-proxy "
  echo " "
  cd "/opt/auth-proxy"
  PROXY_USER="$PROXY_USER"
  PROXY_GROUP="$PROXY_USER"
  nohup $START_COMMAND >> $PROXY_LOG 2>&1 &
  echo $! > $PROXY_PID_FILE
  RETVAL=$?
  if [ $RETVAL = 0 ]; then
      success
  else
      failure
  fi
  echo
  ;;
    status)
    status auth-proxy
    RETVAL=$?
  ;;
    stop)
  echo -n "Shutting down auth-proxy "
  status 'auth-proxy' > /dev/null 2>&1
  RUNNING=$?
  if [ $RUNNING -gt 0 ] ; then
    echo " "
    failure
    echo "Auth-proxy was not running"
    REDVAL=1
  else
    kill `cat $PROXY_PID_FILE`
    RETVAL=$?
    rm -f $PROXY_PID_FILE
  fi
  echo
  ;;
    restart)
  $0 stop
  $0 start
  ;;
    *)
  echo "Usage: $0 {start|stop|restart}"
  exit 1
  ;;
esac
exit $RETVAL

